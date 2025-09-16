import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

// Existing long-running research flow (kept for compatibility with current backend)
export const startResearch = async (query: string): Promise<string> => {
  const { data } = await axios.post(`${API_BASE}/research`, { query })
  return data.task_id
}

export type TaskData = {
  task_id: string
  query: string
  status: 'running' | 'completed' | 'error'
  steps: {
    planning?: any
    searching?: any
    reading?: any
    verifying?: any
    reflecting?: any
    briefing?: any
  }
  brief?: any
  error?: string | null
}

export const getTask = async (taskId: string): Promise<TaskData> => {
  const { data } = await axios.get(`${API_BASE}/research/${taskId}`)
  return data
}

// One-shot FastAPI endpoint (requested): POST http://localhost:8000/api/endpoint
export type OneShotResponse = {
  Planning?: any
  Searching?: any
  Reading?: any
  Verifying?: any
  Reflecting?: any
  Briefing?: {
    Introduction?: string
    'Key Findings'?: string
    Risks?: string
    Conclusion?: string
    Sources?: string
  } | any
}

export const runOneShotResearch = async (query: string, endpoint = `${API_BASE}/api/endpoint`): Promise<OneShotResponse> => {
  const { data } = await axios.post(endpoint, { query })
  return data
}
