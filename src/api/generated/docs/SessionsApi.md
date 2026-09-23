# SessionsApi

All URIs are relative to *http://localhost:8080*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**listSessions**](SessionsApi.md#listsessions) | **GET** /api/sessions | 连接会话列表 |



## listSessions

> Array&lt;Session&gt; listSessions(hostId, status)

连接会话列表

### Example

```ts
import {
  Configuration,
  SessionsApi,
} from '@ananoesis/generated-api';
import type { ListSessionsRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new SessionsApi();

  const body = {
    // string (optional)
    hostId: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // SessionStatus (optional)
    status: ...,
  } satisfies ListSessionsRequest;

  try {
    const data = await api.listSessions(body);
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
| **hostId** | `string` |  | [Optional] [Defaults to `undefined`] |
| **status** | `SessionStatus` |  | [Optional] [Defaults to `undefined`] [Enum: open, ended] |

### Return type

[**Array&lt;Session&gt;**](Session.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | 会话列表 |  -  |
| **400** | 请求校验失败（code&#x3D;validation_error） |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

