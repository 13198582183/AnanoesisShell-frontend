
# ToolCallRecord


## Properties

Name | Type
------------ | -------------
`toolName` | string
`toolParams` | { [key: string]: any; }
`resultStatus` | [ToolResultStatus](ToolResultStatus.md)
`result` | string
`approvalId` | string

## Example

```typescript
import type { ToolCallRecord } from '@ananoesis/generated-api'

// TODO: Update the object below with actual values
const example = {
  "toolName": null,
  "toolParams": null,
  "resultStatus": null,
  "result": null,
  "approvalId": null,
} satisfies ToolCallRecord

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ToolCallRecord
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


