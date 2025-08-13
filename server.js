const express = require('express');
const path = require('path');
const { existsSync } = require('fs');

const app = express();
const port = process.env.PORT || 8080;

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, '/')));

// Check if the API function is present and run it
if (existsSync(path.join(__dirname, 'api', 'chat', 'index.js'))) {
  const chatFunction = require('./api/chat/index.js');
  app.use('/api/chat', (req, res) => {
    // The Azure Function uses a different request/response object,
    // so we'll wrap it to make it compatible with Express.
    const context = {
      log: console.log,
      res: {},
    };
    const expressRes = {
      status: (code) => {
        res.status(code);
        return expressRes;
      },
      json: (body) => res.json(body),
      send: (body) => res.send(body),
      setHeader: (name, value) => res.setHeader(name, value),
    };
    chatFunction(context, { ...req, body: req.body, headers: req.headers }, expressRes);
  });
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
