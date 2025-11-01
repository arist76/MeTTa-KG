use rocket::serde::json::Json;
use rocket::{get, State};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::thread;
use sysinfo::System;

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessInfo {
    id: String,
    name: String,
    cpu_usage: f32,
    memory_usage: u64,
    status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemResources {
    total_memory: u64,
    used_memory: u64,
    cpu_usage: f32,
    data_size: u64,
    processes: Vec<ProcessInfo>,
}

pub struct SpaceDataSizes {
    pub sizes: Mutex<HashMap<String, u64>>,
}

impl Default for SpaceDataSizes {
    fn default() -> Self {
        Self::new()
    }
}

impl SpaceDataSizes {
    pub fn new() -> Self {
        SpaceDataSizes {
            sizes: Mutex::new(HashMap::new()),
        }
    }

    pub fn update(&self, space_id: String, size: u64) {
        let mut sizes = self.sizes.lock().unwrap();
        sizes.insert(space_id, size);
    }

    pub fn get(&self, space_id: &str) -> u64 {
        let sizes = self.sizes.lock().unwrap();
        *sizes.get(space_id).unwrap_or(&0)
    }

    pub fn total(&self) -> u64 {
        let sizes = self.sizes.lock().unwrap();
        sizes.values().sum()
    }
}

#[get("/system/resources")]
pub fn get_system_resources(space_sizes: &State<SpaceDataSizes>) -> Json<SystemResources> {
    let mut sys = System::new();

    sys.refresh_all();
    thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_all();

    let cpu_usage = {
        let cpus = sys.cpus();
        if !cpus.is_empty() {
            let avg_usage = cpus.iter().map(|cpu| cpu.cpu_usage()).sum::<f32>() / cpus.len() as f32;
            avg_usage
        } else {
            0.0
        }
    };

    let total_memory = sys.total_memory() / 1024 / 1024;
    let used_memory = sys.used_memory() / 1024 / 1024;
    println!("[LOG] System Memory: {}/{} MB", used_memory, total_memory);

    let mut processes: Vec<ProcessInfo> = Vec::new();
    let mut rocket_workers_cpu = 0.0;
    let mut rocket_workers_mem = 0;
    let mut rocket_worker_count = 0;

    for (pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();

        if name.starts_with("rocket-worker-t") {
            rocket_workers_cpu += process.cpu_usage();
            rocket_workers_mem += process.memory();
            rocket_worker_count += 1;
        } else if name.contains("api")
            || name.contains("metta")
            || name.contains("mork")
            || name.contains("metta-kg")
            || process.cpu_usage() > 1.0
            || process.memory() > 50 * 1024 * 1024
        {
            processes.push(ProcessInfo {
                id: pid.to_string(),
                name,
                cpu_usage: process.cpu_usage(),
                memory_usage: process.memory() / 1024 / 1024,
                status: if process.cpu_usage() > 1.0 {
                    "running".to_string()
                } else {
                    "idle".to_string()
                },
            });
        }
    }

    if rocket_worker_count > 0 {
        processes.insert(
            0,
            ProcessInfo {
                id: "rocket-workers".to_string(),
                name: format!("rocket workers (x{})", rocket_worker_count),
                cpu_usage: rocket_workers_cpu,
                memory_usage: rocket_workers_mem / 1024 / 1024,
                status: if rocket_workers_cpu > 1.0 {
                    "running".to_string()
                } else {
                    "idle".to_string()
                },
            },
        );
    }

    processes.sort_by(|a, b| {
        b.cpu_usage
            .partial_cmp(&a.cpu_usage)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    processes.truncate(10);

    let data_size = space_sizes.total();

    Json(SystemResources {
        total_memory,
        used_memory,
        cpu_usage,
        data_size: data_size / 1024 / 1024,
        processes,
    })
}

#[get("/system/resources/<space_id>")]
pub fn get_space_resources(
    space_id: String,
    space_sizes: &State<SpaceDataSizes>,
) -> Json<SystemResources> {
    let mut sys = System::new();

    sys.refresh_all();
    thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_all();

    let cpu_usage = {
        let cpus = sys.cpus();
        if !cpus.is_empty() {
            let avg_usage = cpus.iter().map(|cpu| cpu.cpu_usage()).sum::<f32>() / cpus.len() as f32;
            println!(
                "[LOG] Space '{}' CPU Usage Calculated: {:.2}%",
                space_id, avg_usage
            );
            avg_usage
        } else {
            println!(
                "[LOG] No CPUs found for space '{}', returning 0% usage.",
                space_id
            );
            0.0
        }
    };

    let total_memory = sys.total_memory() / 1024 / 1024;
    let used_memory = sys.used_memory() / 1024 / 1024;
    println!(
        "[LOG] Space '{}' Memory: {}/{} MB",
        space_id, used_memory, total_memory
    );

    let mut processes: Vec<ProcessInfo> = Vec::new();
    let mut rocket_workers_cpu = 0.0;
    let mut rocket_workers_mem = 0;
    let mut rocket_worker_count = 0;

    for (pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();

        if name.starts_with("rocket-worker-t") {
            rocket_workers_cpu += process.cpu_usage();
            rocket_workers_mem += process.memory();
            rocket_worker_count += 1;
        } else if name.contains("api")
            || name.contains("metta")
            || name.contains("mork")
            || name.contains("metta-kg")
            || name.contains("rocket")
        {
            processes.push(ProcessInfo {
                id: pid.to_string(),
                name,
                cpu_usage: process.cpu_usage(),
                memory_usage: process.memory() / 1024 / 1024,
                status: if process.cpu_usage() > 5.0 {
                    "running".to_string()
                } else {
                    "idle".to_string()
                },
            });
        }
    }

    if rocket_worker_count > 0 {
        processes.insert(
            0,
            ProcessInfo {
                id: "rocket-workers".to_string(),
                name: format!("rocket workers (x{})", rocket_worker_count),
                cpu_usage: rocket_workers_cpu,
                memory_usage: rocket_workers_mem / 1024 / 1024,
                status: if rocket_workers_cpu > 5.0 {
                    "running".to_string()
                } else {
                    "idle".to_string()
                },
            },
        );
    }

    processes.sort_by(|a, b| {
        b.cpu_usage
            .partial_cmp(&a.cpu_usage)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    processes.truncate(10);

    let data_size = space_sizes.get(&space_id);

    Json(SystemResources {
        total_memory,
        used_memory,
        cpu_usage,
        data_size: data_size / 1024 / 1024,
        processes,
    })
}
