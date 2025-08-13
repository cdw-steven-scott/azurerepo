const express = require('express');
const path = require('path');
const { existsSync } = require('fs');

const app = express();
const port = process.env.PORT || 80;

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, '/')));

// Handle the API route
if (existsSync(path.join(__dirname, 'api', 'chat', 'index.js'))) {
  const chatFunction = require('./api/chat/index.js');
  app.use('/api/chat', express.json(), (req, res) => {
    // A simple mock context object for compatibility
    const context = {
      log: console.log,
      res: {
        status: (code) => {
          res.status(code);
          return context.res;
        },
        json: (body) => res.json(body),
        send: (body) => res.send(body),
      },
    };
    // Call the Azure Function code
    chatFunction(context, { ...req, body: req.body, headers: req.headers });
  });
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
