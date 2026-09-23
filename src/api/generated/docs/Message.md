
# Message

会话消息。V2 新增 seq/source/command_id/run_id

## Properties

Name | Type
------------ | -------------
`id` | string
`conversationId` | string
`seq` | number
`role` | [MessageRole](MessageRole.md)
`content` | string
`thinkingContent` | string
`toolCalls` | [Array&lt;ToolCallRecord&gt;](ToolCallRecord.md)
`source` | [MessageSource](MessageSource.md)
`commandId` | string
`runId` | string
`createdAt` | Date

## Example

```typescript
import type { Message } from '@ananoesis/generated-api'

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "conversationId": null,
  "seq": null,
  "role": null,
  "content": null,
  "thinkingContent": null,
  "toolCalls": null,
  "source": null,
  "commandId": null,
  "runId": null,
  "createdAt": null,
} satisfies Message

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as Message
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


