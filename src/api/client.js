import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:4001/api",
  timeout: 30000,
});

export async function fetchEmails() {
  const res = await api.get("/emails");
  return res.data;
}

export async function fetchEmailDetail(id) {
  const res = await api.get(`/email/${id}`);
  return res.data;
}

export async function fetchAttachments(id) {
  const res = await api.get(`/email/${id}/attachments`);
  return res.data;
}


export async function notifyN8n(id) {
  const res = await api.post(`/email/${id}/notify-n8n`, null, {
    timeout: 330000, 
  });
  return res.data;
}

export async function dismissEmail(id) {
  const res = await api.post(`/email/${id}/dismiss`);
  return res.data;
}

export async function completeEmail(id) {
  const res = await api.post(`/email/${id}/complete`);
  return res.data;
}

export default api;