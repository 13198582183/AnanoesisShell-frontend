# TransferContentApi

All URIs are relative to *http://localhost:8080*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**downloadTransferContent**](TransferContentApi.md#downloadtransfercontent) | **GET** /api/transfers/{id}/content | 下载二进制内容（从代码生成排除） |
| [**uploadTransferContent**](TransferContentApi.md#uploadtransfercontent) | **PUT** /api/transfers/{id}/content | 上传二进制内容（从代码生成排除） |



## downloadTransferContent

> Blob downloadTransferContent(id, ticket)

下载二进制内容（从代码生成排除）

### Example

```ts
import {
  Configuration,
  TransferContentApi,
} from '@ananoesis/generated-api';
import type { DownloadTransferContentRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new TransferContentApi();

  const body = {
    // string | 传输任务 ID（V2）
    id: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string
    ticket: ticket_example,
  } satisfies DownloadTransferContentRequest;

  try {
    const data = await api.downloadTransferContent(body);
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
| **id** | `string` | 传输任务 ID（V2） | [Defaults to `undefined`] |
| **ticket** | `string` |  | [Defaults to `undefined`] |

### Return type

**Blob**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/octet-stream`, `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | 下载内容 |  * Content-Disposition -  <br>  * Cache-Control -  <br>  * Referrer-Policy -  <br>  |
| **404** | 资源不存在（code&#x3D;not_found） |  -  |
| **409** | 票据无效或已过期 |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## uploadTransferContent

> uploadTransferContent(id, body)

上传二进制内容（从代码生成排除）

### Example

```ts
import {
  Configuration,
  TransferContentApi,
} from '@ananoesis/generated-api';
import type { UploadTransferContentRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new TransferContentApi();

  const body = {
    // string | 传输任务 ID（V2）
    id: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // Blob
    body: BINARY_DATA_HERE,
  } satisfies UploadTransferContentRequest;

  try {
    const data = await api.uploadTransferContent(body);
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
| **id** | `string` | 传输任务 ID（V2） | [Defaults to `undefined`] |
| **body** | `Blob` |  | |

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/octet-stream`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | 上传成功 |  -  |
| **409** | 传输状态冲突 |  -  |
| **413** | 文件大小超出限制 |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

