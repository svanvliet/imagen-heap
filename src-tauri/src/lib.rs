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
    next_id: Arc<Mutex<u64>>,
    /// Pending responses: id -> oneshot sender
    pending: Arc<Mutex<std::collections::HashMap<u64, std::sync::mpsc::Sender<serde_json::Value>>>>,
    /// Writer to sidecar stdin (shared across commands)
    writer: Arc<Mutex<Option<Box<dyn Write + Send>>>>,
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

/// Download progress event sent to the frontend
#[derive(Serialize, Clone)]
struct DownloadProgressEvent {
    model_id: String,
    bytes_downloaded: u64,
    total_bytes: u64,
}

/// Adapter download progress event sent to the frontend
#[derive(Serialize, Clone)]
struct AdapterDownloadProgressEvent {
    adapter_id: String,
    bytes_downloaded: u64,
    total_bytes: u64,
}

/// Send an RPC request using raw components (thread-safe, no State<> dependency)
fn send_rpc_raw(
    next_id: &Mutex<u64>,
    pending: &Arc<Mutex<std::collections::HashMap<u64, std::sync::mpsc::Sender<serde_json::Value>>>>,
    writer: &Mutex<Option<Box<dyn Write + Send>>>,
    method: &str,
    params: serde_json::Value,
    timeout_secs: u64,
) -> Result<serde_json::Value, String> {
    let id = {
        let mut counter = next_id.lock().map_err(|e| e.to_string())?;
        let id = *counter;
        *counter += 1;
        id
    };

    debug!("send_rpc: method={} id={}", method, id);

    // Create a channel for this request's response
    let (tx, rx) = std::sync::mpsc::channel();
    {
        let mut pend = pending.lock().map_err(|e| e.to_string())?;
        pend.insert(id, tx);
    }

    // Send request
    let request = RpcRequest {
        jsonrpc: "2.0".to_string(),
        id,
        method: method.to_string(),
        params,
    };

    {
        let mut writer_lock = writer.lock().map_err(|e| {
            error!("send_rpc: failed to lock writer: {}", e);
            e.to_string()
        })?;
        let w = writer_lock.as_mut().ok_or_else(|| {
            error!("send_rpc: backend not running (writer is None)");
            "Backend not running".to_string()
        })?;
        let request_str = serde_json::to_string(&request).map_err(|e| e.to_string())?;
        debug!("send_rpc: writing request: {}", &request_str[..request_str.len().min(200)]);
        writeln!(w, "{}", request_str).map_err(|e| {
            error!("send_rpc: write error: {}", e);
            format!("Write error: {}", e)
        })?;
        w.flush().map_err(|e| {
            error!("send_rpc: flush error: {}", e);
            format!("Flush error: {}", e)
        })?;
    }

    let timeout = std::time::Duration::from_secs(timeout_secs);
    debug!("send_rpc: waiting for response id={} (timeout={}s)", id, timeout.as_secs());
    let response = rx.recv_timeout(timeout).map_err(|e| {
        error!("send_rpc: timeout/channel error for method={} id={}: {}", method, id, e);
        format!("RPC timeout or channel error: {}", e)
    })?;

    debug!("send_rpc: got response id={}: {}", id,
        serde_json::to_string(&response).unwrap_or_default().chars().take(200).collect::<String>());

    // Check for error in response (ignore null — serde serializes None as null)
    if let Some(err) = response.get("error").filter(|v| !v.is_null()) {
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

/// Send an RPC request and wait for the response (convenience wrapper for State<>)
fn send_rpc(
    state: &SidecarState,
    method: &str,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    send_rpc_raw(&state.next_id, &state.pending, &state.writer, method, params, 300)
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

/// Generate an image (async — can take minutes)
#[tauri::command]
async fn generate_image(state: State<'_, SidecarState>, config: serde_json::Value) -> Result<serde_json::Value, String> {
    info!("Command: generate_image");
    let next_id = state.next_id.clone();
    let pending = state.pending.clone();
    let writer = state.writer.clone();

    tokio::task::spawn_blocking(move || {
        send_rpc_raw(&next_id, &pending, &writer, "generate", config, 1800)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Cancel the current generation (short timeout — fire and forget)
#[tauri::command]
fn cancel_generation(state: State<SidecarState>) -> Result<serde_json::Value, String> {
    info!("Command: cancel_generation");
    send_rpc_raw(
        &state.next_id,
        &state.pending,
        &state.writer,
        "cancel_generation",
        serde_json::json!({}),
        5,
    )
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

/// Download a model (async — runs on background thread to avoid blocking UI)
#[tauri::command]
async fn download_model(state: State<'_, SidecarState>, model_id: String) -> Result<serde_json::Value, String> {
    info!("Command: download_model model_id={}", model_id);

    // Clone Arc-wrapped components so we can send them to a background thread
    let next_id = state.next_id.clone();
    let pending = state.pending.clone();
    let writer = state.writer.clone();

    tokio::task::spawn_blocking(move || {
        send_rpc_raw(&next_id, &pending, &writer, "download_model", serde_json::json!({"model_id": model_id}), 3600)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
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

/// Save HuggingFace API token
#[tauri::command]
fn save_hf_token(state: State<SidecarState>, token: String) -> Result<serde_json::Value, String> {
    info!("Command: save_hf_token");
    send_rpc(&state, "save_hf_token", serde_json::json!({"token": token}))
}

/// Mark wizard as completed
#[tauri::command]
fn mark_wizard_done(state: State<SidecarState>) -> Result<serde_json::Value, String> {
    info!("Command: mark_wizard_done");
    send_rpc(&state, "mark_wizard_done", serde_json::json!({}))
}

/// Reset wizard so it shows again on next launch
#[tauri::command]
fn reset_wizard(state: State<SidecarState>) -> Result<serde_json::Value, String> {
    info!("Command: reset_wizard");
    send_rpc(&state, "reset_wizard", serde_json::json!({}))
}

// --- Character management commands ---

/// List all characters
#[tauri::command]
fn list_characters(state: State<SidecarState>) -> Result<serde_json::Value, String> {
    info!("Command: list_characters");
    send_rpc(&state, "list_characters", serde_json::json!({}))
}

/// Create a new character card
#[tauri::command]
fn create_character(state: State<SidecarState>, name: String, description: String, reference_image_paths: Vec<String>) -> Result<serde_json::Value, String> {
    info!("Command: create_character name={}", name);
    send_rpc(&state, "create_character", serde_json::json!({
        "name": name,
        "description": description,
        "reference_image_paths": reference_image_paths,
    }))
}

/// Update character metadata
#[tauri::command]
fn update_character(state: State<SidecarState>, character_id: String, updates: serde_json::Value) -> Result<serde_json::Value, String> {
    info!("Command: update_character id={}", character_id);
    send_rpc(&state, "update_character", serde_json::json!({
        "character_id": character_id,
        "updates": updates,
    }))
}

/// Delete a character
#[tauri::command]
fn delete_character(state: State<SidecarState>, character_id: String) -> Result<serde_json::Value, String> {
    info!("Command: delete_character id={}", character_id);
    send_rpc(&state, "delete_character", serde_json::json!({
        "character_id": character_id,
    }))
}

/// Get a single character by ID
#[tauri::command]
fn get_character(state: State<SidecarState>, character_id: String) -> Result<serde_json::Value, String> {
    info!("Command: get_character id={}", character_id);
    send_rpc(&state, "get_character", serde_json::json!({
        "character_id": character_id,
    }))
}

/// Add a reference image to an existing character
#[tauri::command]
fn add_reference_image(state: State<SidecarState>, character_id: String, image_path: String) -> Result<serde_json::Value, String> {
    info!("Command: add_reference_image id={}", character_id);
    send_rpc(&state, "add_reference_image", serde_json::json!({
        "character_id": character_id,
        "image_path": image_path,
    }))
}

/// Remove a reference image by index
#[tauri::command]
fn remove_reference_image(state: State<SidecarState>, character_id: String, image_index: u32) -> Result<serde_json::Value, String> {
    info!("Command: remove_reference_image id={} index={}", character_id, image_index);
    send_rpc(&state, "remove_reference_image", serde_json::json!({
        "character_id": character_id,
        "image_index": image_index,
    }))
}

/// Set a LoRA file for a character
#[tauri::command]
fn set_character_lora(state: State<SidecarState>, character_id: String, lora_path: String, trigger_word: String) -> Result<serde_json::Value, String> {
    info!("Command: set_character_lora id={}", character_id);
    send_rpc(&state, "set_character_lora", serde_json::json!({
        "character_id": character_id,
        "lora_path": lora_path,
        "trigger_word": trigger_word,
    }))
}

/// Remove LoRA from a character
#[tauri::command]
fn remove_character_lora(state: State<SidecarState>, character_id: String) -> Result<serde_json::Value, String> {
    info!("Command: remove_character_lora id={}", character_id);
    send_rpc(&state, "remove_character_lora", serde_json::json!({
        "character_id": character_id,
    }))
}

/// Reveal a model's folder in the system file manager
#[tauri::command]
fn reveal_model_folder(state: State<SidecarState>, model_id: String, app_handle: AppHandle) -> Result<(), String> {
    info!("Command: reveal_model_folder for {}", model_id);
    let result = send_rpc(&state, "get_model_path", serde_json::json!({"model_id": model_id}))?;
    let path = result.get("path").and_then(|v| v.as_str()).unwrap_or("");
    if path.is_empty() {
        return Err("Model path not found".to_string());
    }
    use tauri_plugin_opener::OpenerExt;
    app_handle.opener().reveal_item_in_dir(std::path::Path::new(path))
        .map_err(|e| format!("Failed to reveal folder: {}", e))
}

/// Reveal a file in the system file manager (Finder on macOS)
#[tauri::command]
fn reveal_in_finder(path: String, app_handle: AppHandle) -> Result<(), String> {
    info!("Command: reveal_in_finder for {}", path);
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("File not found: {}", path));
    }
    use tauri_plugin_opener::OpenerExt;
    app_handle.opener().reveal_item_in_dir(p)
        .map_err(|e| format!("Failed to reveal in Finder: {}", e))
}

// --- Adapter management commands ---

/// Get available runtime providers (short timeout — avoids blocking UI on slow imports)
#[tauri::command]
fn get_available_providers(state: State<SidecarState>) -> Result<serde_json::Value, String> {
    info!("Command: get_available_providers");
    send_rpc_raw(
        &state.next_id,
        &state.pending,
        &state.writer,
        "get_available_providers",
        serde_json::json!({}),
        10,  // 10s timeout — heavy imports may take a while on first call
    )
}

/// List all adapters with download status
#[tauri::command]
fn get_adapters(state: State<SidecarState>) -> Result<serde_json::Value, String> {
    info!("Command: get_adapters");
    send_rpc(&state, "get_adapters", serde_json::json!({}))
}

/// Download an adapter model (async, long-running)
#[tauri::command]
async fn download_adapter(state: State<'_, SidecarState>, adapter_id: String) -> Result<serde_json::Value, String> {
    info!("Command: download_adapter id={}", adapter_id);
    let next_id = state.next_id.clone();
    let pending = state.pending.clone();
    let writer = state.writer.clone();
    tokio::task::spawn_blocking(move || {
        send_rpc_raw(&next_id, &pending, &writer, "download_adapter", serde_json::json!({"adapter_id": adapter_id}), 3600)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Delete a downloaded adapter
#[tauri::command]
fn delete_adapter(state: State<SidecarState>, adapter_id: String) -> Result<serde_json::Value, String> {
    info!("Command: delete_adapter id={}", adapter_id);
    send_rpc(&state, "delete_adapter", serde_json::json!({"adapter_id": adapter_id}))
}

/// Start the Python sidecar process and set up the stdout reader thread
fn start_sidecar(python_path: &str, script_path: &str, app_handle: &AppHandle, pending: Arc<Mutex<std::collections::HashMap<u64, std::sync::mpsc::Sender<serde_json::Value>>>>) -> Result<(Child, Box<dyn Write + Send>), String> {
    info!("Starting Python sidecar: {} {}", python_path, script_path);

    // Derive PYTHONPATH from the script path so imagen_heap package is importable
    // Script is at .../python/src/imagen_heap/main.py → we need .../python/src/
    let python_src_dir = std::path::Path::new(script_path)
        .parent()  // .../python/src/imagen_heap/
        .and_then(|p| p.parent())  // .../python/src/
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    info!("Setting PYTHONPATH={}", python_src_dir);

    let mut child = Command::new(python_path)
        .arg(script_path)
        .env("PYTHONPATH", &python_src_dir)
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
                                    } else if method == "download_progress" {
                                        if let Some(params) = &resp.params {
                                            let event = DownloadProgressEvent {
                                                model_id: params.get("model_id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                                bytes_downloaded: params.get("bytes_downloaded").and_then(|v| v.as_u64()).unwrap_or(0),
                                                total_bytes: params.get("total_bytes").and_then(|v| v.as_u64()).unwrap_or(0),
                                            };
                                            let _ = handle.emit("backend:download_progress", event);
                                        }
                                    } else if method == "adapter_download_progress" {
                                        if let Some(params) = &resp.params {
                                            let event = AdapterDownloadProgressEvent {
                                                adapter_id: params.get("adapter_id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                                bytes_downloaded: params.get("bytes_downloaded").and_then(|v| v.as_u64()).unwrap_or(0),
                                                total_bytes: params.get("total_bytes").and_then(|v| v.as_u64()).unwrap_or(0),
                                            };
                                            let _ = handle.emit("backend:adapter_download_progress", event);
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
                        Err(_) => {
                            debug!("Ignoring non-JSON sidecar output: {}", &l[..l.len().min(200)]);
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
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarState {
            process: Mutex::new(None),
            next_id: Arc::new(Mutex::new(1)),
            pending: pending_for_state,
            writer: Arc::new(Mutex::new(None)),
        })
        .setup(move |app| {
            // Set the window icon for dev mode (bundled builds use bundle.icon)
            #[cfg(debug_assertions)]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let icon_bytes = include_bytes!("../icons/128x128@2x.png");
                    if let Ok(icon) = tauri::image::Image::from_bytes(icon_bytes) {
                        let _ = window.set_icon(icon);
                    }
                }
            }

            let resource_dir = app
                .path()
                .resource_dir()
                .unwrap_or_default();
            info!("Resource dir: {:?}", resource_dir);

            // --- Resolve Python interpreter ---
            // Priority: 1) venv at ~/.imagen-heap/venv  2) system python3
            let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
            let venv_python = std::path::PathBuf::from(&home)
                .join(".imagen-heap/venv/bin/python3");

            let python_path = if venv_python.exists() {
                info!("Using venv Python: {:?}", venv_python);
                venv_python.to_string_lossy().to_string()
            } else {
                info!("Venv not found at {:?}, falling back to system python3", venv_python);
                "python3".to_string()
            };

            // --- Find the Python sidecar script ---
            let cwd = std::env::current_dir().unwrap_or_default();
            let script_candidates = vec![
                // Dev mode: CWD is project root
                cwd.join("python/src/imagen_heap/main.py"),
                // Dev mode: CWD is src-tauri/ (npx tauri dev)
                cwd.join("../python/src/imagen_heap/main.py"),
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
                match start_sidecar(&python_path, &path_str, app.handle(), pending.clone()) {
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

                        // If sidecar failed and no venv exists, show setup dialog
                        if !venv_python.exists() {
                            let setup_script = resource_dir.join("scripts/setup.sh");
                            let setup_path = if setup_script.exists() {
                                setup_script.to_string_lossy().to_string()
                            } else {
                                // Dev mode: try relative to CWD
                                let dev_script = cwd.join("scripts/setup.sh");
                                if dev_script.exists() {
                                    dev_script.to_string_lossy().to_string()
                                } else {
                                    String::new()
                                }
                            };

                            let msg = if setup_path.is_empty() {
                                "Imagen Heap requires a Python environment to run.\n\n\
                                 Please run the setup script included with the app:\n\n\
                                 bash scripts/setup.sh\n\n\
                                 Then relaunch Imagen Heap.".to_string()
                            } else {
                                format!(
                                    "Imagen Heap requires a Python environment to run.\n\n\
                                     Please open Terminal and run:\n\n\
                                     bash \"{}\"\n\n\
                                     This is a one-time setup (~5 minutes).\n\
                                     Then relaunch Imagen Heap.",
                                    setup_path
                                )
                            };

                            warn!("Python environment not configured. Showing setup dialog.");
                            let handle = app.handle().clone();
                            tauri::async_runtime::spawn(async move {
                                use tauri_plugin_dialog::DialogExt;
                                handle.dialog()
                                    .message(msg)
                                    .title("Setup Required")
                                    .blocking_show();
                            });
                        }

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
            cancel_generation,
            get_models,
            is_first_run,
            get_default_downloads,
            download_model,
            delete_model,
            get_disk_usage,
            save_hf_token,
            mark_wizard_done,
            reset_wizard,
            reveal_model_folder,
            reveal_in_finder,
            list_characters,
            create_character,
            update_character,
            delete_character,
            get_character,
            add_reference_image,
            remove_reference_image,
            set_character_lora,
            remove_character_lora,
            get_available_providers,
            get_adapters,
            download_adapter,
            delete_adapter,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
