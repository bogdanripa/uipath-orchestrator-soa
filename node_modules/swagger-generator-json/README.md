# SWAGGER GENERATOR JSON

Library generate json use for swagger-ui-express

## Quick start

### Example for 1 method in document:
```js
// example.js file

const { DType, Response, Operation, API } = require('swagger-generator-json')
// By default will be get method
const documentsSearchUser = new API({
    path: '/public/users/search',
    operation: [
        new Operation({
            method: DType.get,
            parameters: [
                {
                    name: 'username',
                    type: DType.string,
                    place: DType.query,
                    description: "Username must be required"
                }
            ],
            responses: [
                new Response({
                    schema: [{
                        id: DType.number,
                        name: DType.string,
                        isAdmin: DType.boolean
                    }]
                }),
                new Response({
                    code: 302,
                    schema: [{
                        id: DType.number,
                        name: DType.string,
                        isAdmin: DType.boolean
                    }]
                })
            ],
            tags: 'public/user'
        })
    ]
})
```

![alt text](https://firebasestorage.googleapis.com/v0/b/mn-shop.appspot.com/o/search.PNG?alt=media&token=2eb6bbbf-2686-4dac-b9e4-7121099f53f9 "Visualize of bellow document instance")

### Example for multi method in document:
```js
// example.js file

const { DType, Response, Operation, API } = require('swagger-generator-json')
// GET method
const operationGet = new Operation({
    method: DType.get,
    parameters: [
        {
            name: 'token',
            type: DType.string,
            place: DType.body,
            description: "Token need to authenticate"
        },
        {
            name: 'userid',
            type: DType.string,
            place: DType.path,
            description: "Only number"
        }
    ],
    responses: [
        new Response({
            schema: [{
                id: DType.number,
                name: DType.string,
                isAdmin: DType.boolean
            }]
        })
    ],
    summary: "API GET USER",
    tags: 'public/user'
})

// POST method
const operationPost = new Operation({
    method: DType.post,
    parameters: [
        {
            name: 'token',
            type: DType.string,
            place: DType.header,
            description: "Token need to authenticate"
        }
    ],
    responses: [
        new Response({
            schema: {
                id: DType.number,
                name: DType.string,
                isAdmin: DType.boolean
            },
        })
    ],
    tags: 'public/user',
    summary: "API CREATE USER"
})

const documentsPublicUser = new API({
    path: '/public/users',
    operation: [operationGet, operationPost]
})
```


![alt text](https://firebasestorage.googleapis.com/v0/b/mn-shop.appspot.com/o/get.PNG?alt=media&token=05a682f9-f5f4-49fb-bb55-f9c29c2f7866 "Visualize of bellow document instance")

![alt text](https://firebasestorage.googleapis.com/v0/b/mn-shop.appspot.com/o/post.PNG?alt=media&token=04e4203d-4f21-40cc-b54f-b8c94ff2540a "Visualize of bellow document instance")


### Export to use
```js
module.exports = [documentsPublicUser, documentsSearchUser]
```

### Create instance Document
```js
// document.js file
const paths = require('./example')
const { Document } = require('swagger-generator-json')

module.exports = new Document({
    description: `This is the Devteam's documents of project`,
    version: "1.0.0",
    title: "App Name",
    paths
})
```

### Use with swagger-ui-express
```js
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./document');
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
```

### Some example for request (schema), params (type):

```js
// Data response
const data = {
    status: true,
    message: "Success",
    list: [
        {
            username: "devteam",
            isAdmin: "true",
            age: 25
        }
    ]
}
// Convert to schema
new Response({
    schema: {
        status: DType.boolean,
        message: DType.string,
        list: [
            {
                username: DType.string,
                isAdmin: DType.boolean,
                age: DType.number
            }
        ]
    }
})
```

![alt text](https://firebasestorage.googleapis.com/v0/b/mn-shop.appspot.com/o/chema2.PNG?alt=media&token=6f0dfc42-23f4-4ecb-bdc1-b56cc0b1e2c4 "Visualize of bellow document instance")


```js
const param = [
        {
            name: 'list',
            type: {
                userid: DType.number,
                list: [{
                    productId: DType.number,
                    price: DType.number
                }]
            },
            place: DType.body,
            description: "User's orders"
        }
    ]
```

![alt text](https://firebasestorage.googleapis.com/v0/b/mn-shop.appspot.com/o/type2.PNG?alt=media&token=37e8fcd1-4375-42be-8f28-7029885d3c01 "Visualize of bellow document instance")
