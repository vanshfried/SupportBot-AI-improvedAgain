// Frontend/src/API/api.js
const BASE_URL = import.meta.env.VITE_BACKEND_URL;

const fetchWrapper = async (endpoint, options = {}) => {
  const controller = new AbortController();
  const timeout = 20000;

  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      credentials: "include",
      signal: controller.signal,
      ...options,
    });

    clearTimeout(id);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorObj = {
        response: {
          status: response.status,
          data,
        },
      };

      console.error("❌ API ERROR:", errorObj);

      throw errorObj;
    }

    return {
      data,
      status: response.status,
    };
  } catch (err) {
    console.error("❌ NETWORK ERROR:", err);

    if (err.name === "AbortError") {
      throw { message: "Request timeout" };
    }

    throw err;
  }
};

const API = {
  get: (url, config = {}) => fetchWrapper(url, { method: "GET", ...config }),

  post: (url, data, config = {}) => {
    const isFormData = data instanceof FormData;

    const headers = isFormData
      ? { ...(config.headers || {}) }
      : {
          "Content-Type": "application/json",
          ...(config.headers || {}),
        };

    return fetchWrapper(url, {
      method: "POST",
      body: isFormData ? data : JSON.stringify(data),
      headers,
      ...config,
    });
  },

  put: (url, data, config = {}) =>
    fetchWrapper(url, {
      method: "PUT",
      body: JSON.stringify(data),
      ...config,
    }),

  delete: (url, config = {}) =>
    fetchWrapper(url, { method: "DELETE", ...config }),
};

export default API;
