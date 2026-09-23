
# SessionCreated

创建连接响应（control_token 仅此次展示；design D2）

## Properties

Name | Type
------------ | -------------
`id` | string
`hostId` | string
`status` | string
`controlToken` | string

## Example

```typescript
import type { SessionCreated } from '@ananoesis/generated-api'

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "hostId": null,
  "status": null,
  "controlToken": null,
} satisfies SessionCreated

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SessionCreated
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


