
# Transfer


## Properties

Name | Type
------------ | -------------
`id` | string
`sessionId` | string
`direction` | [TransferDirection](TransferDirection.md)
`fileName` | string
`remotePath` | string
`status` | [TransferStatus](TransferStatus.md)
`bytesTransferred` | number
`totalBytes` | number
`readyDeadline` | Date
`failureCode` | string
`failureMessage` | string
`createdAt` | Date
`updatedAt` | Date

## Example

```typescript
import type { Transfer } from '@ananoesis/generated-api'

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "sessionId": null,
  "direction": null,
  "fileName": null,
  "remotePath": null,
  "status": null,
  "bytesTransferred": null,
  "totalBytes": null,
  "readyDeadline": null,
  "failureCode": null,
  "failureMessage": null,
  "createdAt": null,
  "updatedAt": null,
} satisfies Transfer

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as Transfer
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


