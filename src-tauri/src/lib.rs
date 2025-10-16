use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::State;
use tokio::runtime::Runtime;
use warp::Filter;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct DumpData {
    r#type: String,
    timestamp: String,
    output: String,
    file: Option<String>,
    line: Option<i32>,
}

type DumpStore = Arc<Mutex<Vec<DumpData>>>;

async fn start_http_server(dump_store: DumpStore) {
    let dump_store = warp::any().map(move || dump_store.clone());

    let cors = warp::cors()
        .allow_any_origin()
        .allow_headers(vec!["content-type"])
        .allow_methods(vec!["POST", "GET"]);

    let dump_route = warp::path("api")
        .and(warp::path("dump"))
        .and(warp::post())
        .and(warp::body::json())
        .and(dump_store)
        .and_then(|dump_data: DumpData, store: DumpStore| async move {
            let mut store = store.lock().unwrap();
            store.push(dump_data);
            Result::<_, warp::Rejection>::Ok(warp::reply::with_status("OK", warp::http::StatusCode::OK))
        });

    let routes = dump_route.with(cors);

    println!("Starting HTTP server on 127.0.0.1:3000 and [::1]:3000");
    tokio::join!(
        warp::serve(routes.clone()).run(([127, 0, 0, 1], 3000)),
        warp::serve(routes).run(([0, 0, 0, 0, 0, 0, 0, 1], 3000)),
    );
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn add_dump(dump_store: State<DumpStore>, dump_data: DumpData) -> Result<String, String> {
    let mut store = dump_store.lock().map_err(|e| e.to_string())?;
    store.push(dump_data);
    Ok("Dump added successfully".to_string())
}

#[tauri::command]
fn get_dumps(dump_store: State<DumpStore>) -> Result<Vec<DumpData>, String> {
    let store = dump_store.lock().map_err(|e| e.to_string())?;
    Ok(store.clone())
}

#[tauri::command]
fn clear_dumps(dump_store: State<DumpStore>) -> Result<String, String> {
    let mut store = dump_store.lock().map_err(|e| e.to_string())?;
    store.clear();
    Ok("Dumps cleared successfully".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let dump_store = Arc::new(Mutex::new(Vec::new()));
    let server_store = dump_store.clone();

    // Start HTTP server in background
    std::thread::spawn(move || {
        let rt = Runtime::new().unwrap();
        rt.block_on(start_http_server(server_store));
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(dump_store)
        .invoke_handler(tauri::generate_handler![greet, add_dump, get_dumps, clear_dumps])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
