## 12306helper

自动查票，如果有票，会播放音乐，表格高亮显示，自动点击"预订"按钮进入预订页面，自动选中乘客和席别，当人工输入4位验证码后自动提交订单。

## 运行环境

Google Chrome 浏览器。

## 安装

1. `git clone https://github.com/wei345/12306helper.git` 或 [下载压缩包](https://github.com/wei345/12306helper/archive/master.zip)并解压
2. 在Chrome地址栏打开 chrome://extensions/
3. 开启"Developer mode"
4. 点击"Load unpacked extension..."
5. 选择 `12306helper` 目录

## 用法

1. 使用Google Chrome浏览器，登录12306
2. 进入[车票预订](https://kyfw.12306.cn/otn/leftTicket/init)页面
3. 填写出发地、目的地、出发日
4. 在`12306helper`表单填写车次、席别、乘客，点击"启动"按钮

## How it works

当页面加载完成时，本扩展的JS被载入。

* 在查询期间，每秒自动检"查询"按钮是否可用，如果可用则触发"查询"按钮的点击事件。
* 在查询期间，每秒检查查询结果表格是否有符合条件的车次，如果有则触发"预订"按钮的点击事件，进入订单提交页面。
* 在订单提交页面，自动选中乘客和席别，监听验证码输入框，输入4个字符时自动提交。