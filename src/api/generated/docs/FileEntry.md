
# FileEntry

远端目录条目

## Properties

Name | Type
------------ | -------------
`name` | string
`path` | string
`size` | number
`mode` | string
`mtime` | Date
`isDir` | boolean
`isLink` | boolean
`isRegular` | boolean

## Example

```typescript
import type { FileEntry } from '@ananoesis/generated-api'

// TODO: Update the object below with actual values
const example = {
  "name": null,
  "path": null,
  "size": null,
  "mode": null,
  "mtime": null,
  "isDir": null,
  "isLink": null,
  "isRegular": null,
} satisfies FileEntry

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as FileEntry
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


