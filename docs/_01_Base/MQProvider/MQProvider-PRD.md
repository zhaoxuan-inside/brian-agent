# MQ Provider

## 1. 设计目标

1. 解耦具体的MQ 与 系统；
2. 接管 MQ 调用请求；

## 2. 功能设计

### 2.1. 新增（send）

发送消息

### 2.2. 消费（consume）

消费消息

## 默认使用

基于RelationProvider提供的关系数据库接口实现MQ，消息默认保存1天；
