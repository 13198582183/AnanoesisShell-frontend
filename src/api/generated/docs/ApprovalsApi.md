# ApprovalsApi

All URIs are relative to *http://localhost:8080*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**listApprovals**](ApprovalsApi.md#listapprovals) | **GET** /api/approvals | 审批审计日志查询（分页） |



## listApprovals

> ApprovalsPage listApprovals(page, size, hostId, decision)

审批审计日志查询（分页）

### Example

```ts
import {
  Configuration,
  ApprovalsApi,
} from '@ananoesis/generated-api';
import type { ListApprovalsRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new ApprovalsApi();

  const body = {
    // number (optional)
    page: 56,
    // number (optional)
    size: 56,
    // string (optional)
    hostId: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // ApprovalDecision (optional)
    decision: ...,
  } satisfies ListApprovalsRequest;

  try {
    const data = await api.listApprovals(body);
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
| **page** | `number` |  | [Optional] [Defaults to `1`] |
| **size** | `number` |  | [Optional] [Defaults to `20`] |
| **hostId** | `string` |  | [Optional] [Defaults to `undefined`] |
| **decision** | `ApprovalDecision` |  | [Optional] [Defaults to `undefined`] [Enum: approved, cancelled, timed_out] |

### Return type

[**ApprovalsPage**](ApprovalsPage.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | 审计记录分页结果 |  -  |
| **400** | 请求校验失败（code&#x3D;validation_error） |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

