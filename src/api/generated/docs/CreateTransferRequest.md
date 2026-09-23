
# CreateTransferRequest


## Properties

Name | Type
------------ | -------------
`direction` | [TransferDirection](TransferDirection.md)
`remotePath` | string
`fileName` | string
`size` | number
`overwrite` | boolean
`expectedTarget` | [ExpectedTarget](ExpectedTarget.md)

## Example

```typescript
import type { CreateTransferRequest } from '@ananoesis/generated-api'

// TODO: Update the object below with actual values
const example = {
  "direction": null,
  "remotePath": null,
  "fileName": null,
  "size": null,
  "overwrite": null,
  "expectedTarget": null,
} satisfies CreateTransferRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as CreateTransferRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


