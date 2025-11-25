function normalizeQueryParams(queryParams) {
  if (!queryParams) {
    return {};
  }

  if (!Array.isArray(queryParams)) {
    // Already in dictionary form (or another primitive) – return as-is.
    return queryParams;
  }

  return queryParams.reduce((acc, param) => {
    if (!param || !param.name) {
      return acc;
    }

    acc[param.name] = {
      in: param.in,
      required: param.required,
      schema: param.schema,
      example: param.example,
      description: param.description,
      allowReserved: param.allowReserved,
      explode: param.explode,
      style: param.style,
      deprecated: param.deprecated,
      ...(param.default !== undefined ? { default: param.default } : {}),
    };

    return acc;
  }, {});
}

module.exports = {
  normalizeQueryParams,
};

