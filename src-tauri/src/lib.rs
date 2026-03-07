use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager, State};
use log::{info, warn};

/// State for managing the Python sidecar process
struct SidecarState {
    process: Mutex<Option<Child>>,
    /// Counter for JSON-RPC request IDs
    next_id: Mutex<u64>,
    /// Pending responses: id -> oneshot sender
    pending: Arc<Mutex<std::collections::HashMap<u64, std::sync::mpsc::Sender<serde_json::Value>>>>,
    /// Writer to sidecar stdin (shared across commands)
    writer: Mutex<Option<Box<dyn Write + Send>>>,
}

/// JSON-RPC request
#[derive(Serialize)]
struct RpcRequest {
    jsonrpc: String,
    id: u64,
    method: String,
    params: serde_json::Value,
}

/// JSON-RPC response
#[derive(Deserialize, Serialize, Debug, Clone)]
struct RpcResponse {
    #[allow(dead_code)]
    jsonrpc: String,
    id: Option<u64>,
    method: Option<String>,
    params: Option<serde_json::Value>,
    result: Option<serde_json::Value>,
    error: Option<RpcError>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
struct RpcError {
    #[allow(dead_code)]
    code: i64,
    message: String,
}

/// Progress event sent to the frontend
#[derive(Serialize, Clone)]
struct ProgressEvent {
    job_id: String,
    step: u32,
    total_steps: u32,
    preview_base64: Option<String>,
}

/// Send an RPC request and wait for the response (with timeout)
fn send_rpc(
    state: &SidecarState,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let id = {
        let mut counter = state.next_id.lock().map_err(|e| e.to_string())?;
        let id = *counter;
        *counter += 1;
        id
    };

    // Create a channel for this request's response
    let (tx, rx) = std::sync::mpsc::channel();
    {
        let mut pending = state.pending.lock().map_err(|e| e.to_string())?;
        pending.insert(id, tx);
    }

    // Send request
    let request = RpcRequest {
        jsonrpc: "2.0".to_string(),
        id,
        method: method.to_string(),
        params,
    };

    {
        let mut writer_lock = state.writer.lock().map_err(|e| e.to_string())?;
        let writer = writer_lock.as_mut().ok_or("Backend not running")?;
        let request_str = serde_json::to_string(&request).map_err(|e| e.to_string())?;
        writeln!(writer, "{}", request_str).map_err(|e| format!("Write error: {}", e))?;
        writer.flush().map_err(|e| format!("Flush error: {}", e))?;
    }

    // Wait for response (timeout: 5 minutes for generation)
    let timeout = std::time::Duration::from_secs(300);
    let response = rx.recv_timeout(timeout).map_err(|e| format!("RPC timeout or channel error: {}", e))?;

    // Check for error in response
    if let Some(err) = response.get("error") {
        if let Some(msg) = err.get("message").and_then(|m| m.as_str()) {
            return Err(format!("RPC error: {}", msg));
        }
        return Err(format!("RPC error: {:?}", err));
    }

    response.get("result").cloned().ok_or_else(|| "No result in response".to_string())
}

/// Ping the Python backend
#[tauri::command]
fn ping_backend(state: State<SidecarState>) -> Result<serde_json::Value, String> {
    send_rpc(&state, "ping", serde_json::json!({}))
}

/// Get the backend status
#[tauri::command]
fn get_backend_status(state: State<SidecarState>) -> Result<String, String> {
    let lock = state.process.lock().map_err(|e| e.to_string())?;
    match lock.as_ref() {
        Some(_) => Ok("running".to_string()),
        None => Ok("stopped".to_string()),
    }
}

/// Generate an image
#[tauri::command]
fn generate_image(state: State<SidecarState>, config: serde_json::Value) -> Result<serde_json::Value, String> {
    send_rpc(&state, "generate", config)
}

/// Start the Python sidecar process and set up the stdout reader thread
fn start_sidecar(python_path: &str, script_path: &str, app_handle: &AppHandle, pending: Arc<Mutex<std::collections::HashMap<u64, std::sync::mpsc::Sender<serde_json::Value>>>>) -> Result<(Child, Box<dyn Write + Send>), String> {
    info!("Starting Python sidecar: {} {}", python_path, script_path);

    let mut child = Command::new(python_path)
        .arg(script_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start sidecar: {}", e))?;

    let stdin = child.stdin.take().ok_or("Failed to get stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

    // Spawn a thread to read stderr (logging)
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(l) => log::debug!("[python] {}", l),
                Err(_) => break,
            }
        }
    });

    // Spawn a thread to read stdout (JSON-RPC responses and notifications)
    let handle = app_handle.clone();
    let pending_clone = pending.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    let l = l.trim().to_string();
                    if l.is_empty() {
                        continue;
                    }

                    match serde_json::from_str::<RpcResponse>(&l) {
                        Ok(resp) => {
                            // Check if it's a notification (progress)
                            if resp.id.is_none() {
                                if let Some(method) = &resp.method {
                                    if method == "progress" {
                                        if let Some(params) = &resp.params {
                                            let event = ProgressEvent {
                                                job_id: params.get("job_id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                                step: params.get("step").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                                                total_steps: params.get("total_steps").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                                                preview_base64: params.get("preview_base64").and_then(|v| v.as_str()).map(|s| s.to_string()),
                                            };
                                            let _ = handle.emit("backend:progress", event);
                                        }
                                    }
                                }
                            } else if let Some(id) = resp.id {
                                // It's a response to a request
                                let mut pending = pending_clone.lock().unwrap();
                                if let Some(sender) = pending.remove(&id) {
                                    let resp_value = serde_json::to_value(&resp).unwrap_or_default();
                                    let _ = sender.send(resp_value);
                                }
                            }
                        }
                        Err(e) => {
                            log::warn!("Failed to parse sidecar output: {} (line: {})", e, &l[..l.len().min(100)]);
                        }
                    }
                }
                Err(_) => break,
            }
        }
        log::info!("Sidecar stdout reader thread exiting");
    });

    Ok((child, Box::new(stdin)))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .init();

    info!("Starting Imagen Heap v0.1.0");

    let pending: Arc<Mutex<std::collections::HashMap<u64, std::sync::mpsc::Sender<serde_json::Value>>>> =
        Arc::new(Mutex::new(std::collections::HashMap::new()));

    let pending_for_state = pending.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState {
            process: Mutex::new(None),
            next_id: Mutex::new(1),
            pending: pending_for_state,
            writer: Mutex::new(None),
        })
        .setup(move |app| {
            let resource_dir = app
                .path()
                .resource_dir()
                .unwrap_or_default();
            info!("Resource dir: {:?}", resource_dir);

            // Find the Python sidecar script
            let script_candidates = vec![
                // Dev mode: relative to CWD
                std::env::current_dir()
                    .unwrap_or_default()
                    .join("python/src/imagen_heap/main.py"),
                // Bundled: in resource directory
                resource_dir.join("python/src/imagen_heap/main.py"),
            ];

            let script_path = script_candidates.iter().find(|p| p.exists());

            if let Some(path) = script_path {
                let path_str = path.to_string_lossy().to_string();
                match start_sidecar("python3", &path_str, app.handle(), pending.clone()) {
                    Ok((child, writer)) => {
                        let state: State<SidecarState> = app.state();
                        *state.process.lock().unwrap() = Some(child);
                        *state.writer.lock().unwrap() = Some(writer);
                        info!("Python sidecar started successfully");

                        // Emit connected status
                        let _ = app.emit("backend:status", "connected");
                    }
                    Err(e) => {
                        warn!("Failed to start Python sidecar: {}. App will run without backend.", e);
                        let _ = app.emit("backend:status", "error");
                    }
                }
            } else {
                warn!("Python sidecar script not found. Backend not available.");
                let _ = app.emit("backend:status", "disconnected");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![ping_backend, get_backend_status, generate_image])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
