
# DirectoryListResponse


## Properties

Name | Type
------------ | -------------
`items` | [Array&lt;FileEntry&gt;](FileEntry.md)
`nextCursor` | string
`hasMore` | boolean

## Example

```typescript
import type { DirectoryListResponse } from '@ananoesis/generated-api'

// TODO: Update the object below with actual values
const example = {
  "items": null,
  "nextCursor": null,
  "hasMore": null,
} satisfies DirectoryListResponse

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as DirectoryListResponse
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


