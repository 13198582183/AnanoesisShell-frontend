# FilesApi

All URIs are relative to *http://localhost:8080*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**listSessionFiles**](FilesApi.md#listsessionfiles) | **GET** /api/sessions/{id}/files | 远端目录浏览（有界 READDIR） |



## listSessionFiles

> DirectoryListResponse listSessionFiles(id, xSessionControl, path, cursor, limit)

远端目录浏览（有界 READDIR）

### Example

```ts
import {
  Configuration,
  FilesApi,
} from '@ananoesis/generated-api';
import type { ListSessionFilesRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new FilesApi();

  const body = {
    // string | 连接实例 ID（V2）
    id: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string | 连接控制令牌（design D2）
    xSessionControl: xSessionControl_example,
    // string
    path: path_example,
    // string (optional)
    cursor: cursor_example,
    // number (optional)
    limit: 56,
  } satisfies ListSessionFilesRequest;

  try {
    const data = await api.listSessionFiles(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **id** | `string` | 连接实例 ID（V2） | [Defaults to `undefined`] |
| **xSessionControl** | `string` | 连接控制令牌（design D2） | [Defaults to `undefined`] |
| **path** | `string` |  | [Defaults to `undefined`] |
| **cursor** | `string` |  | [Optional] [Defaults to `undefined`] |
| **limit** | `number` |  | [Optional] [Defaults to `100`] |

### Return type

[**DirectoryListResponse**](DirectoryListResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | 目录条目分页列表 |  -  |
| **400** | 请求校验失败（code&#x3D;validation_error） |  -  |
| **404** | 资源不存在（code&#x3D;not_found） |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

