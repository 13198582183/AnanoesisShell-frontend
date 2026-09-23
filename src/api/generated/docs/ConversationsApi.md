# ConversationsApi

All URIs are relative to *http://localhost:8080*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**batchDeleteConversations**](ConversationsApi.md#batchdeleteconversations) | **POST** /api/conversations/batch-delete | 批量删除对话（最多 100 个） |
| [**createConversation**](ConversationsApi.md#createconversation) | **POST** /api/conversations | 创建 AI 会话（应用级管理接口） |
| [**deleteConversation**](ConversationsApi.md#deleteconversation) | **DELETE** /api/conversations/{id} | 删除单个对话 |
| [**listConversationMessages**](ConversationsApi.md#listconversationmessages) | **GET** /api/conversations/{id}/messages | 查询会话消息历史（keyset 分页） |
| [**listConversations**](ConversationsApi.md#listconversations) | **GET** /api/conversations | AI 会话列表（应用级管理接口） |



## batchDeleteConversations

> batchDeleteConversations(batchDeleteRequest)

批量删除对话（最多 100 个）

### Example

```ts
import {
  Configuration,
  ConversationsApi,
} from '@ananoesis/generated-api';
import type { BatchDeleteConversationsRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new ConversationsApi();

  const body = {
    // BatchDeleteRequest
    batchDeleteRequest: ...,
  } satisfies BatchDeleteConversationsRequest;

  try {
    const data = await api.batchDeleteConversations(body);
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
| **batchDeleteRequest** | [BatchDeleteRequest](BatchDeleteRequest.md) |  | |

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | 批量删除成功 |  -  |
| **400** | 请求校验失败（code&#x3D;validation_error） |  -  |
| **409** | 集合中存在活动对话（code&#x3D;conflict） |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## createConversation

> Conversation createConversation(conversationCreate)

创建 AI 会话（应用级管理接口）

### Example

```ts
import {
  Configuration,
  ConversationsApi,
} from '@ananoesis/generated-api';
import type { CreateConversationRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new ConversationsApi();

  const body = {
    // ConversationCreate
    conversationCreate: ...,
  } satisfies CreateConversationRequest;

  try {
    const data = await api.createConversation(body);
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
| **conversationCreate** | [ConversationCreate](ConversationCreate.md) |  | |

### Return type

[**Conversation**](Conversation.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | 已创建 |  -  |
| **400** | 请求校验失败（code&#x3D;validation_error） |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteConversation

> deleteConversation(id)

删除单个对话

### Example

```ts
import {
  Configuration,
  ConversationsApi,
} from '@ananoesis/generated-api';
import type { DeleteConversationRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new ConversationsApi();

  const body = {
    // string
    id: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteConversationRequest;

  try {
    const data = await api.deleteConversation(body);
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
| **id** | `string` |  | [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **204** | 已删除 |  -  |
| **404** | 资源不存在（code&#x3D;not_found） |  -  |
| **409** | 对话正在执行中（code&#x3D;conflict） |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## listConversationMessages

> MessageListResponse listConversationMessages(id, cursor, limit)

查询会话消息历史（keyset 分页）

V2 改为 (seq,id) keyset 分页，默认 50、最大 200。 消息增加 source/command_id/run_id 字段（design D6）。 

### Example

```ts
import {
  Configuration,
  ConversationsApi,
} from '@ananoesis/generated-api';
import type { ListConversationMessagesRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new ConversationsApi();

  const body = {
    // string
    id: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string (optional)
    cursor: cursor_example,
    // number (optional)
    limit: 56,
  } satisfies ListConversationMessagesRequest;

  try {
    const data = await api.listConversationMessages(body);
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
| **id** | `string` |  | [Defaults to `undefined`] |
| **cursor** | `string` |  | [Optional] [Defaults to `undefined`] |
| **limit** | `number` |  | [Optional] [Defaults to `50`] |

### Return type

[**MessageListResponse**](MessageListResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | 消息分页列表（按时间升序） |  -  |
| **404** | 资源不存在（code&#x3D;not_found） |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## listConversations

> Array&lt;Conversation&gt; listConversations()

AI 会话列表（应用级管理接口）

### Example

```ts
import {
  Configuration,
  ConversationsApi,
} from '@ananoesis/generated-api';
import type { ListConversationsRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new ConversationsApi();

  try {
    const data = await api.listConversations();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**Array&lt;Conversation&gt;**](Conversation.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | 会话列表 |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

