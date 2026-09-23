
# ErrorCode

统一错误码注册表。V2 新增 session_control_required/session_control_invalid/ transfer_quota_exceeded/transfer_conflict/transfer_target_changed/context_budget_exceeded。 

## Properties

Name | Type
------------ | -------------

## Example

```typescript
import type { ErrorCode } from '@ananoesis/generated-api'

// TODO: Update the object below with actual values
const example = {
} satisfies ErrorCode

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ErrorCode
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


