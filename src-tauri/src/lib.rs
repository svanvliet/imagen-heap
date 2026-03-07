use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager, State};
use log::{info, warn, error, debug};

/// Log directory: ~/.imagen-heap/logs/
fn log_dir() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    std::path::PathBuf::from(home).join(".imagen-heap").join("logs")
}

/// Initialize file + console logging via fern
fn init_logging() {
    let log_path = log_dir();
    std::fs::create_dir_all(&log_path).ok();

    let log_file = log_path.join("tauri.log");

    // Rotate: if log file > 5MB, rename to .log.old
    if let Ok(meta) = std::fs::metadata(&log_file) {
        if meta.len() > 5_000_000 {
            let old = log_path.join("tauri.log.old");
            std::fs::rename(&log_file, old).ok();
        }
    }

    let file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .expect("Failed to open log file");

    fern::Dispatch::new()
        .format(|out, message, record| {
            out.finish(format_args!(
                "{} [{}] {}: {}",
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f"),
                record.level(),
                record.target(),
                message
            ))
        })
        // File: debug level (everything)
        .chain(
            fern::Dispatch::new()
                .level(log::LevelFilter::Debug)
                .chain(file)
        )
        // Console: info level
        .chain(
            fern::Dispatch::new()
                .level(log::LevelFilter::Info)
                .chain(std::io::stderr())
        )
        .apply()
        .expect("Failed to initialize logging");

    info!("Logging initialized — file: {}", log_file.display());
}

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

    debug!("send_rpc: method={} id={}", method, id);

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
        let mut writer_lock = state.writer.lock().map_err(|e| {
            error!("send_rpc: failed to lock writer: {}", e);
            e.to_string()
        })?;
        let writer = writer_lock.as_mut().ok_or_else(|| {
            error!("send_rpc: backend not running (writer is None)");
            "Backend not running".to_string()
        })?;
        let request_str = serde_json::to_string(&request).map_err(|e| e.to_string())?;
        debug!("send_rpc: writing request: {}", &request_str[..request_str.len().min(200)]);
        writeln!(writer, "{}", request_str).map_err(|e| {
            error!("send_rpc: write error: {}", e);
            format!("Write error: {}", e)
        })?;
        writer.flush().map_err(|e| {
            error!("send_rpc: flush error: {}", e);
            format!("Flush error: {}", e)
        })?;
    }

    // Wait for response (timeout: 5 minutes for generation)
    let timeout = std::time::Duration::from_secs(300);
    debug!("send_rpc: waiting for response id={} (timeout={}s)", id, timeout.as_secs());
    let response = rx.recv_timeout(timeout).map_err(|e| {
        error!("send_rpc: timeout/channel error for method={} id={}: {}", method, id, e);
        format!("RPC timeout or channel error: {}", e)
    })?;

    debug!("send_rpc: got response id={}: {}", id,
        serde_json::to_string(&response).unwrap_or_default().chars().take(200).collect::<String>());

    // Check for error in response
    if let Some(err) = response.get("error") {
        if let Some(msg) = err.get("message").and_then(|m| m.as_str()) {
            error!("send_rpc: RPC error for method={}: {}", method, msg);
            return Err(format!("RPC error: {}", msg));
        }
        error!("send_rpc: RPC error for method={}: {:?}", method, err);
        return Err(format!("RPC error: {:?}", err));
    }

    response.get("result").cloned().ok_or_else(|| {
        error!("send_rpc: no result in response for method={}", method);
        "No result in response".to_string()
    })
}

/// Ping the Python backend
#[tauri::command]
fn ping_backend(state: State<SidecarState>) -> Result<serde_json::Value, String> {
    debug!("Command: ping_backend");
    let result = send_rpc(&state, "ping", serde_json::json!({}));
    debug!("Command: ping_backend result={:?}", result.as_ref().map(|v| v.to_string().chars().take(100).collect::<String>()));
    result
}

/// Get the backend status
#[tauri::command]
fn get_backend_status(state: State<SidecarState>) -> Result<String, String> {
    let lock = state.process.lock().map_err(|e| e.to_string())?;
    let status = match lock.as_ref() {
        Some(_) => "running".to_string(),
        None => "stopped".to_string(),
    };
    debug!("Command: get_backend_status = {}", status);
    Ok(status)
}

/// Generate an image
#[tauri::command]
fn generate_image(state: State<SidecarState>, config: serde_json::Value) -> Result<serde_json::Value, String> {
    info!("Command: generate_image");
    send_rpc(&state, "generate", config)
}

/// Get all models with status
#[tauri::command]
fn get_models(state: State<SidecarState>) -> Result<serde_json::Value, String> {
    debug!("Command: get_models");
    send_rpc(&state, "get_models", serde_json::json!({}))
}

/// Check if first run
#[tauri::command]
fn is_first_run(state: State<SidecarState>) -> Result<serde_json::Value, String> {
    info!("Command: is_first_run");
    let result = send_rpc(&state, "is_first_run", serde_json::json!({}));
    info!("Command: is_first_run result={:?}", result);
    result
}

/// Get default models for first-run download
#[tauri::command]
fn get_default_downloads(state: State<SidecarState>) -> Result<serde_json::Value, String> {
    debug!("Command: get_default_downloads");
    send_rpc(&state, "get_default_downloads", serde_json::json!({}))
}

/// Download a model
#[tauri::command]
fn download_model(state: State<SidecarState>, model_id: String) -> Result<serde_json::Value, String> {
    info!("Command: download_model model_id={}", model_id);
    send_rpc(&state, "download_model", serde_json::json!({"model_id": model_id}))
}

/// Delete a model
#[tauri::command]
fn delete_model(state: State<SidecarState>, model_id: String) -> Result<serde_json::Value, String> {
    info!("Command: delete_model model_id={}", model_id);
    send_rpc(&state, "delete_model", serde_json::json!({"model_id": model_id}))
}

/// Get disk usage
#[tauri::command]
fn get_disk_usage(state: State<SidecarState>) -> Result<serde_json::Value, String> {
    debug!("Command: get_disk_usage");
    send_rpc(&state, "get_disk_usage", serde_json::json!({}))
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
        .map_err(|e| {
            error!("Failed to spawn sidecar process: {}", e);
            format!("Failed to start sidecar: {}", e)
        })?;

    info!("Sidecar process spawned (pid={})", child.id());

    let stdin = child.stdin.take().ok_or("Failed to get stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

    // Spawn a thread to read stderr (Python logging → our info level)
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(l) => info!("[python] {}", l),
                Err(e) => {
                    debug!("Sidecar stderr reader ended: {}", e);
                    break;
                }
            }
        }
        info!("Sidecar stderr reader thread exiting");
    });

    // Spawn a thread to read stdout (JSON-RPC responses and notifications)
    let handle = app_handle.clone();
    let pending_clone = pending.clone();
    thread::spawn(move || {
        debug!("Sidecar stdout reader thread started");
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    let l = l.trim().to_string();
                    if l.is_empty() {
                        continue;
                    }

                    debug!("Sidecar stdout: {}", &l[..l.len().min(200)]);

                    match serde_json::from_str::<RpcResponse>(&l) {
                        Ok(resp) => {
                            // Check if it's a notification (progress)
                            if resp.id.is_none() {
                                if let Some(method) = &resp.method {
                                    debug!("Sidecar notification: method={}", method);
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
                                debug!("Sidecar response: id={}", id);
                                let mut pending = pending_clone.lock().unwrap();
                                if let Some(sender) = pending.remove(&id) {
                                    let resp_value = serde_json::to_value(&resp).unwrap_or_default();
                                    let _ = sender.send(resp_value);
                                } else {
                                    warn!("No pending request for response id={}", id);
                                }
                            }
                        }
                        Err(e) => {
                            warn!("Failed to parse sidecar output: {} (line: {})", e, &l[..l.len().min(200)]);
                        }
                    }
                }
                Err(e) => {
                    error!("Sidecar stdout reader error: {}", e);
                    break;
                }
            }
        }
        info!("Sidecar stdout reader thread exiting");
    });

    Ok((child, Box::new(stdin)))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_logging();

    info!("=== Imagen Heap v0.1.0 starting ===");
    info!("Log directory: {}", log_dir().display());
    info!("Working directory: {:?}", std::env::current_dir().unwrap_or_default());

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
            let cwd = std::env::current_dir().unwrap_or_default();
            let script_candidates = vec![
                // Dev mode: relative to CWD
                cwd.join("python/src/imagen_heap/main.py"),
                // Bundled: in resource directory
                resource_dir.join("python/src/imagen_heap/main.py"),
            ];

            for (i, candidate) in script_candidates.iter().enumerate() {
                let exists = candidate.exists();
                debug!("Script candidate [{}]: {:?} (exists={})", i, candidate, exists);
            }

            let script_path = script_candidates.iter().find(|p| p.exists());

            if let Some(path) = script_path {
                let path_str = path.to_string_lossy().to_string();
                info!("Using Python script: {}", path_str);
                match start_sidecar("python3", &path_str, app.handle(), pending.clone()) {
                    Ok((child, writer)) => {
                        let state: State<SidecarState> = app.state();
                        *state.process.lock().unwrap() = Some(child);
                        *state.writer.lock().unwrap() = Some(writer);
                        info!("Python sidecar started and writer stored");

                        // Emit connected status
                        let _ = app.emit("backend:status", "connected");
                    }
                    Err(e) => {
                        error!("Failed to start Python sidecar: {}", e);
                        let _ = app.emit("backend:status", "error");
                    }
                }
            } else {
                error!("Python sidecar script not found in any candidate path");
                for candidate in &script_candidates {
                    error!("  Checked: {:?}", candidate);
                }
                let _ = app.emit("backend:status", "disconnected");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping_backend,
            get_backend_status,
            generate_image,
            get_models,
            is_first_run,
            get_default_downloads,
            download_model,
            delete_model,
            get_disk_usage,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
