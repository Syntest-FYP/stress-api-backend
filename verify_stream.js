const axios = require("axios");

async function testStreaming() {
  const baseURL = "http://localhost:3000/api";
  const email = `naeemmaria60@gmail.com`;
  const password = "sllgV20!";

  console.log("1. Registering/Logging in...");
  let token = null;
  let userId = null;

  try {
    // Login
    const loginRes = await axios.post(`${baseURL}/auth/login`, {
      email,
      password,
    });

    token = loginRes.data.token || loginRes.data.accessToken;

    if (!token) {
      console.log("Token not found in body, checking cookies...");
      const cookies = loginRes.headers["set-cookie"];
      if (cookies) {
        const accessCookie = cookies.find((c) => c.startsWith("access_token="));
        if (accessCookie) {
          token = accessCookie.split(";")[0].split("=")[1];
          console.log("Got token from cookie.");
        }
      }
    }

    if (!token) {
      throw new Error("Could not get access token");
    }

    console.log("Logged in. Token/User obtained.");

    const streamUrl = `${baseURL}/chat/stream?message=hello&suiteId=a03f5ea6-597b-4a04-94a2-07dfee298c9a`;
    console.log(`2. Connecting to stream: ${streamUrl}`);

    const response = await axios({
      method: "get",
      url: streamUrl,
      responseType: "stream",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log("Connected! Waiting for data...");

    response.data.on("data", (chunk) => {
      console.log("Received chunk:", chunk.toString());
    });

    response.data.on("end", () => {
      console.log("Stream ended.");
    });

    response.data.on("error", (err) => {
      console.error("Stream error:", err);
    });
  } catch (error) {
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error("Data:", JSON.stringify(error.response.data));
    } else {
      console.error("Error:", error.message);
    }
  }
}

testStreaming();
