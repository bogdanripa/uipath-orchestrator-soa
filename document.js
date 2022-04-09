const express = require('express');
const swaggerUi = require("swagger-ui-express");
const app = express();
const port = 3000;

// document.js file
const paths = require('./example')
const { Document } = require('swagger-generator-json')
 
var aaa = new Document({
    description: `This is the Devteam's documents of project`,
    version: "1.0.0",
    title: "App Name",
    paths
})

//console.log(paths);
//console.log(paths[0]['/public/users/search'].get);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(aaa));

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
});
