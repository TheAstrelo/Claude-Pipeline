// Request logger: one line per request once the response finishes.
module.exports = function logger(req, res, next) {
  const started = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - started;
    console.log(`${req.method} ${req.url} ${res.statusCode} ${ms}ms`);
  });
  next();
};
