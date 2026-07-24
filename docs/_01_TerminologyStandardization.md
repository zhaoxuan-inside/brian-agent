# 名词标准化

`msg_id`：消息ID，用户输入，或者Agent输出等都认为是一条独立的消息；
`interact_id`：交互ID，表示一次输入和输出消息，包含一个或多个msg_id；
`work_id`：工作ID，表示一次完整的工作ID，用户或者学习等一次输入经过整个Agent系统所有的消息的集合，包含一个或多个interact_id；
`session_id`：用户的一个会话中的内容，包含一个或多个work_id;
`soul`：来自hermes的概念，作为prompt的开头部分，用来作为处理一类工具应该具有的品格；