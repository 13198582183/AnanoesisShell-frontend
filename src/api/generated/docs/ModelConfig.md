
# ModelConfig

模型配置。V2 新增 context_window_tokens/max_output_tokens/ output_limit_field/thinking_request_format（design D7/D8）。 

## Properties

Name | Type
------------ | -------------
`id` | string
`provider` | string
`baseUrl` | string
`model` | string
`apiKey` | string
`apiKeySet` | boolean
`defaultThinkingMode` | [ThinkingMode](ThinkingMode.md)
`isActive` | boolean
`contextWindowTokens` | number
`maxOutputTokens` | number
`outputLimitField` | [OutputLimitField](OutputLimitField.md)
`thinkingRequestFormat` | [ThinkingRequestFormat](ThinkingRequestFormat.md)
`createdAt` | Date
`updatedAt` | Date

## Example

```typescript
import type { ModelConfig } from '@ananoesis/generated-api'

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "provider": mindie,
  "baseUrl": null,
  "model": null,
  "apiKey": null,
  "apiKeySet": null,
  "defaultThinkingMode": null,
  "isActive": null,
  "contextWindowTokens": null,
  "maxOutputTokens": null,
  "outputLimitField": null,
  "thinkingRequestFormat": null,
  "createdAt": null,
  "updatedAt": null,
} satisfies ModelConfig

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as ModelConfig
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


