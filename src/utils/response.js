const sendResponse = (res, statusCode, message, data = null) => {
  const response = {
    success: statusCode < 400,
    message,
  };

  if (data) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

const sendError = (res, statusCode, message, error = null) => {
  const response = {
    success: false,
    message,
  };

  if (error && process.env.NODE_ENV === "development") {
    response.error = error;
  }

  return res.status(statusCode).json(response);
};

module.exports = {
  sendResponse,
  sendError,
};
