use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Manager, State};
use log::{info, warn};

/// State for managing the Python sidecar process
struct SidecarState {
    process: Mutex<Option<Child>>,
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
#[derive(Deserialize, Debug)]
struct RpcResponse {
    #[allow(dead_code)]
    jsonrpc: String,
    #[allow(dead_code)]
    id: Option<u64>,
    result: Option<serde_json::Value>,
    error: Option<RpcError>,
}

#[derive(Deserialize, Debug)]
struct RpcError {
    #[allow(dead_code)]
    code: i64,
    message: String,
}

/// Send a JSON-RPC request to the Python sidecar and get a response
fn send_rpc(
    process: &mut Child,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let request = RpcRequest {
        jsonrpc: "2.0".to_string(),
        id: 1,
        method: method.to_string(),
        params,
    };

    let stdin = process.stdin.as_mut().ok_or("No stdin available")?;
    let request_str = serde_json::to_string(&request).map_err(|e| e.to_string())?;
    writeln!(stdin, "{}", request_str).map_err(|e| format!("Failed to write to stdin: {}", e))?;
    stdin.flush().map_err(|e| format!("Failed to flush stdin: {}", e))?;

    let stdout = process.stdout.as_mut().ok_or("No stdout available")?;
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .map_err(|e| format!("Failed to read from stdout: {}", e))?;

    let response: RpcResponse =
        serde_json::from_str(&line).map_err(|e| format!("Failed to parse response: {} (raw: {})", e, line.trim()))?;

    if let Some(err) = response.error {
        return Err(format!("RPC error: {}", err.message));
    }

    response.result.ok_or_else(|| "No result in response".to_string())
}

/// Ping the Python backend to verify it's alive
#[tauri::command]
fn ping_backend(state: State<SidecarState>) -> Result<serde_json::Value, String> {
    let mut lock = state.process.lock().map_err(|e| e.to_string())?;
    let process = lock.as_mut().ok_or("Backend not running")?;
    send_rpc(process, "ping", serde_json::json!({}))
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

/// Start the Python sidecar process
fn start_sidecar(python_path: &str, script_path: &str) -> Result<Child, String> {
    info!("Starting Python sidecar: {} {}", python_path, script_path);
    Command::new(python_path)
        .arg(script_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start sidecar: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .init();

    info!("Starting Imagen Heap v0.1.0");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState {
            process: Mutex::new(None),
        })
        .setup(|app| {
            let resource_dir = app
                .path()
                .resource_dir()
                .unwrap_or_default();
            info!("Resource dir: {:?}", resource_dir);

            // Try to start the Python sidecar
            let python_dir = resource_dir.join("python");
            let script_path = python_dir.join("src").join("imagen_heap").join("main.py");
            let script_str = script_path.to_string_lossy().to_string();

            if script_path.exists() {
                match start_sidecar("python3", &script_str) {
                    Ok(child) => {
                        let state: State<SidecarState> = app.state();
                        let mut lock = state.process.lock().unwrap();
                        *lock = Some(child);
                        info!("Python sidecar started");
                    }
                    Err(e) => {
                        warn!("Failed to start Python sidecar: {}. App will run without backend.", e);
                    }
                }
            } else {
                // In dev mode, try to find the python directory relative to the project
                let dev_script = std::env::current_dir()
                    .unwrap_or_default()
                    .join("python")
                    .join("src")
                    .join("imagen_heap")
                    .join("main.py");
                let dev_str = dev_script.to_string_lossy().to_string();

                if dev_script.exists() {
                    match start_sidecar("python3", &dev_str) {
                        Ok(child) => {
                            let state: State<SidecarState> = app.state();
                            let mut lock = state.process.lock().unwrap();
                            *lock = Some(child);
                            info!("Python sidecar started (dev mode)");
                        }
                        Err(e) => {
                            warn!("Failed to start Python sidecar: {}. App will run without backend.", e);
                        }
                    }
                } else {
                    warn!("Python sidecar script not found at {:?} or {:?}. Backend not available.", script_path, dev_script);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![ping_backend, get_backend_status])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
