import axios from "axios";

const backendBase = process.env.EXPO_PUBLIC_BACKEND_URL;

if (!backendBase) {
  // eslint-disable-next-line no-console
  console.warn("EXPO_PUBLIC_BACKEND_URL is not set");
}

export const api = axios.create({
  baseURL: backendBase ? `${backendBase}/api` : "/api",
  timeout: 20_000,
  headers: {
    "Content-Type": "application/json",
  },
});
