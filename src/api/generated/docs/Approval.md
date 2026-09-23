
# Approval


## Properties

Name | Type
------------ | -------------
`id` | string
`createdAt` | Date
`hostId` | string
`hostLabel` | string
`toolName` | string
`toolParams` | { [key: string]: any; }
`aiAnalysis` | string
`decision` | [ApprovalDecision](ApprovalDecision.md)
`decidedAt` | Date
`execution` | [ExecutionResult](ExecutionResult.md)

## Example

```typescript
import type { Approval } from '@ananoesis/generated-api'

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "createdAt": null,
  "hostId": null,
  "hostLabel": null,
  "toolName": null,
  "toolParams": null,
  "aiAnalysis": null,
  "decision": null,
  "decidedAt": null,
  "execution": null,
} satisfies Approval

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as Approval
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


