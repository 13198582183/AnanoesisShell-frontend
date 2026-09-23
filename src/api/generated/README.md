# @ananoesis/generated-api@0.2.0-draft

A TypeScript SDK client for the localhost API.

## Usage

First, install the SDK from npm.

```bash
npm install @ananoesis/generated-api --save
```

Next, try it out.


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


## Documentation

### API Endpoints

All URIs are relative to *http://localhost:8080*

| Class | Method | HTTP request | Description
| ----- | ------ | ------------ | -------------
*ApprovalsApi* | [**listApprovals**](docs/ApprovalsApi.md#listapprovals) | **GET** /api/approvals | 审批审计日志查询（分页）
*ConversationsApi* | [**batchDeleteConversations**](docs/ConversationsApi.md#batchdeleteconversations) | **POST** /api/conversations/batch-delete | 批量删除对话（最多 100 个）
*ConversationsApi* | [**createConversation**](docs/ConversationsApi.md#createconversation) | **POST** /api/conversations | 创建 AI 会话（应用级管理接口）
*ConversationsApi* | [**deleteConversation**](docs/ConversationsApi.md#deleteconversation) | **DELETE** /api/conversations/{id} | 删除单个对话
*ConversationsApi* | [**listConversationMessages**](docs/ConversationsApi.md#listconversationmessages) | **GET** /api/conversations/{id}/messages | 查询会话消息历史（keyset 分页）
*ConversationsApi* | [**listConversations**](docs/ConversationsApi.md#listconversations) | **GET** /api/conversations | AI 会话列表（应用级管理接口）
*FilesApi* | [**listSessionFiles**](docs/FilesApi.md#listsessionfiles) | **GET** /api/sessions/{id}/files | 远端目录浏览（有界 READDIR）
*HostsApi* | [**createHost**](docs/HostsApi.md#createhost) | **POST** /api/hosts | 新增服务器配置
*HostsApi* | [**deleteHost**](docs/HostsApi.md#deletehost) | **DELETE** /api/hosts/{id} | 删除服务器配置
*HostsApi* | [**getHost**](docs/HostsApi.md#gethost) | **GET** /api/hosts/{id} | 查看单个服务器配置
*HostsApi* | [**listHosts**](docs/HostsApi.md#listhosts) | **GET** /api/hosts | 服务器配置列表
*HostsApi* | [**updateHost**](docs/HostsApi.md#updatehost) | **PUT** /api/hosts/{id} | 编辑既有服务器配置
*ModelConfigsApi* | [**createModelConfig**](docs/ModelConfigsApi.md#createmodelconfig) | **POST** /api/model-configs | 新增模型配置
*ModelConfigsApi* | [**deleteModelConfig**](docs/ModelConfigsApi.md#deletemodelconfig) | **DELETE** /api/model-configs/{id} | 删除模型配置
*ModelConfigsApi* | [**getModelConfig**](docs/ModelConfigsApi.md#getmodelconfig) | **GET** /api/model-configs/{id} | 查看单个模型配置
*ModelConfigsApi* | [**listModelConfigs**](docs/ModelConfigsApi.md#listmodelconfigs) | **GET** /api/model-configs | 模型配置列表
*ModelConfigsApi* | [**setActiveModelConfig**](docs/ModelConfigsApi.md#setactivemodelconfig) | **PUT** /api/model-configs/active | 切换当前生效的模型配置
*ModelConfigsApi* | [**updateModelConfig**](docs/ModelConfigsApi.md#updatemodelconfig) | **PUT** /api/model-configs/{id} | 编辑模型配置
*SessionsApi* | [**listSessions**](docs/SessionsApi.md#listsessions) | **GET** /api/sessions | 连接会话列表
*SessionsControlApi* | [**closeSession**](docs/SessionsControlApi.md#closesession) | **POST** /api/sessions/{id}/close | 关闭连接实例
*SessionsControlApi* | [**createSession**](docs/SessionsControlApi.md#createsessionoperation) | **POST** /api/sessions | 创建连接实例（返回一次性 control_token；design D2）
*SessionsControlApi* | [**createSessionConversation**](docs/SessionsControlApi.md#createsessionconversation) | **POST** /api/sessions/{id}/conversations | 在连接内创建对话
*SessionsControlApi* | [**listSessionConversations**](docs/SessionsControlApi.md#listsessionconversations) | **GET** /api/sessions/{id}/conversations | 列出连接内对话（keyset 分页）
*SessionsControlApi* | [**setActiveConversation**](docs/SessionsControlApi.md#setactiveconversation) | **PUT** /api/sessions/{id}/active-conversation | 选择连接内活动对话
*SettingsApi* | [**getSettings**](docs/SettingsApi.md#getsettings) | **GET** /api/settings | 读取全局设置
*SettingsApi* | [**updateSettings**](docs/SettingsApi.md#updatesettings) | **PUT** /api/settings | 更新全局设置
*TransferContentApi* | [**downloadTransferContent**](docs/TransferContentApi.md#downloadtransfercontent) | **GET** /api/transfers/{id}/content | 下载二进制内容（从代码生成排除）
*TransferContentApi* | [**uploadTransferContent**](docs/TransferContentApi.md#uploadtransfercontent) | **PUT** /api/transfers/{id}/content | 上传二进制内容（从代码生成排除）
*TransfersApi* | [**cancelTransfer**](docs/TransfersApi.md#canceltransfer) | **POST** /api/transfers/{id}/cancel | 取消传输任务（幂等）
*TransfersApi* | [**claimDownloadTicket**](docs/TransfersApi.md#claimdownloadticket) | **POST** /api/transfers/{id}/download-ticket | 领取下载票据
*TransfersApi* | [**createTransfer**](docs/TransfersApi.md#createtransferoperation) | **POST** /api/sessions/{id}/transfers | 创建文件传输任务（design D9）
*TransfersApi* | [**getTransfer**](docs/TransfersApi.md#gettransfer) | **GET** /api/transfers/{id} | 查询传输任务状态


### Models

- [ActiveConversationRequest](docs/ActiveConversationRequest.md)
- [ActiveModelConfigRequest](docs/ActiveModelConfigRequest.md)
- [Approval](docs/Approval.md)
- [ApprovalDecision](docs/ApprovalDecision.md)
- [ApprovalsPage](docs/ApprovalsPage.md)
- [AuthType](docs/AuthType.md)
- [BatchDeleteRequest](docs/BatchDeleteRequest.md)
- [Conversation](docs/Conversation.md)
- [ConversationCreate](docs/ConversationCreate.md)
- [ConversationListResponse](docs/ConversationListResponse.md)
- [CreateSessionRequest](docs/CreateSessionRequest.md)
- [CreateTransferRequest](docs/CreateTransferRequest.md)
- [DirectoryListResponse](docs/DirectoryListResponse.md)
- [DownloadTicket](docs/DownloadTicket.md)
- [EndReason](docs/EndReason.md)
- [ErrorCode](docs/ErrorCode.md)
- [ErrorDetailsInner](docs/ErrorDetailsInner.md)
- [ExecutionResult](docs/ExecutionResult.md)
- [ExecutionStatus](docs/ExecutionStatus.md)
- [ExpectedTarget](docs/ExpectedTarget.md)
- [FileEntry](docs/FileEntry.md)
- [Host](docs/Host.md)
- [Message](docs/Message.md)
- [MessageListResponse](docs/MessageListResponse.md)
- [MessageRole](docs/MessageRole.md)
- [MessageSource](docs/MessageSource.md)
- [ModelConfig](docs/ModelConfig.md)
- [ModelError](docs/ModelError.md)
- [OutputLimitField](docs/OutputLimitField.md)
- [Session](docs/Session.md)
- [SessionConversationCreate](docs/SessionConversationCreate.md)
- [SessionCreated](docs/SessionCreated.md)
- [SessionStatus](docs/SessionStatus.md)
- [Settings](docs/Settings.md)
- [ThinkingMode](docs/ThinkingMode.md)
- [ThinkingRequestFormat](docs/ThinkingRequestFormat.md)
- [ToolCallRecord](docs/ToolCallRecord.md)
- [ToolResultStatus](docs/ToolResultStatus.md)
- [Transfer](docs/Transfer.md)
- [TransferDirection](docs/TransferDirection.md)
- [TransferStatus](docs/TransferStatus.md)

### Authorization

Endpoints do not require authorization.


## About

This TypeScript SDK client supports the [Fetch API](https://fetch.spec.whatwg.org/)
and is automatically generated by the
[OpenAPI Generator](https://openapi-generator.tech) project:

- API version: `0.2.0-draft`
- Package version: `0.2.0-draft`
- Generator version: `7.25.0`
- Build package: `org.openapitools.codegen.languages.TypeScriptFetchClientCodegen`

The generated npm module supports the following:

- Environments
  * Node.js
  * Webpack
  * Browserify
- Language levels
  * ES5 - you must have a Promises/A+ library installed
  * ES6
- Module systems
  * CommonJS
  * ES6 module system


## Development

### Building

To build the TypeScript source code, you need to have Node.js and npm installed.
After cloning the repository, navigate to the project directory and run:

```bash
npm install
npm run build
```

### Publishing

Once you've built the package, you can publish it to npm:

```bash
npm publish
```

## License

[MIT]()
