
# Conversation

AI 会话。V2 新增 session_id

## Properties

Name | Type
------------ | -------------
`id` | string
`hostId` | string
`sessionId` | string
`title` | string
`createdAt` | Date
`updatedAt` | Date

## Example

```typescript
import type { Conversation } from '@ananoesis/generated-api'

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "hostId": null,
  "sessionId": null,
  "title": null,
  "createdAt": null,
  "updatedAt": null,
} satisfies Conversation

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as Conversation
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


