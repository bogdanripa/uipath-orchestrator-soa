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

console.log(documentsSearchUser);

module.exports = [documentsSearchUser]