/**
 自动查票，如果有票，会播放音乐，表格高亮显示，自动点击"预订"按钮进入预订页面，自动选中乘客和席别，当人工输入4位验证码后自动提交订单。

 环境：

 Google Chrome浏览器。

 用法：

 1. 使用Google Chrome浏览器，登录12306，进入车票预订页面：https://kyfw.12306.cn/otn/leftTicket/init
 2. 填写出发地、目的地、出发日期
 3. 打开控制台，执行此js
 4. 然后，你可以使用以下命令

 h.start(席位, 车次, 乘客名字);
 每个参数都可以使用数字、字符串或数组，null表示使用缺省值。车次字母不区分大小写。
 例如：
 h.start('硬卧', 1458, '张三');                                  //一个车次，一个席别，一个乘客
 h.start('硬卧', [1458, 'k1190'], '张三');                       //一个席别，多个车次，一个乘客
 h.start(['硬卧', '软卧'], [1458, 'k1190'], ['张三', '李四']);    //多个席别，多个车次，多个乘客

 h.status();                                                    //显示运行状态和缺省参数
 h.stop();                                                      //停止

 5. 你应该提前试试此脚本，选择其他日期、其他车次，验证此脚本功能正常

 浏览器最小化，该程序也会正常运行。

 @author: Liu Wei
 */

var version = chrome.runtime.getManifest().version;

var audioTag = null;
var sound = 'http://static.liebao.cn/resources/audio/song25.ogg'; //没有设置正确的 content-type,  Firefox和Safari不能播放该文件
function play() {
    if (!audioTag) audioTag = $('<audio controls autoplay loop>  <source src="' + sound + '" type="audio/mpeg"></audio>');
}

//车票查询页
location.pathname == '/otn/leftTicket/init' && (function () {

    var query = localStorage.query ? JSON.parse(localStorage.query) : {trainNumbers: [], seats: [], names: [], orderByFirst: 'seat'};
    var trainNumbers = query.trainNumbers;
    var seats = query.seats;
    var names = query.names;
    var orderByFirst = query.orderByFirst;

    //解析12306车票预订页面
    var context = document.body;
    var resultTrSelector = '#t-list table tbody tr[id^=ticket_]';
    var queryButton = $('#query_ticket', context);
    var seat2tdIndex = {
        '硬卧': 7,
        '软卧': 6,
        '高级软卧': 5,
        '硬座': 9,
        '无座': 10
    };

    function doGoOrder(tr) {
        $('td:eq(12) a', tr)[0].click();
    }

    function getTrainNumber(tr) {
        return $.trim($('td:first .ticket-info .train div a', tr).text()).toUpperCase();
    }

    function canQuery() {
        //12306 5秒查一次, 更快速的点击查询按钮是没用的
        return queryButton.text() == '查询'
            && !queryButton.hasClass('btn-disabled')
            //两次查询最小间隔，避免太频繁导致浏览器占满CPU
            && (!lastSubmitQueryTime || (new Date().getTime() - lastSubmitQueryTime) > 3000);
    }

    function doSubmitQuery() {
        queryButton[0].click();
    }

    //运行时内部变量
    var submitQueryTimerId;
    var checkTiketsTimerId;
    var isRunning = false;
    var submitQueryCount = 0;
    var lastSubmitQueryTime = 0;
    var startTime = 0;
    var isGoingOrder = false;
    ui();

    function start(mySeats, myTrainNumbers, myNames, myOrderByFirst) {
        if (isRunning) {
            status();
            return;
        }

        submitQueryCount = 0;
        isRunning = true;
        startTime = new Date().getTime();
        isGoingOrder = false;

        if (mySeats) seats = (mySeats instanceof Array ? mySeats : [mySeats]);
        if (myTrainNumbers) trainNumbers = (myTrainNumbers instanceof Array ? myTrainNumbers : [myTrainNumbers]);
        if (myNames) names = (myNames instanceof Array ? myNames : [myNames]);
        orderByFirst = myOrderByFirst || 'seat';

        localStorage.query = JSON.stringify({
            trainNumbers: trainNumbers,
            seats: seats,
            names: names,
            orderByFirst: orderByFirst
        });

        submitQueryTimerId = setInterval(submitQuery, 100);
        checkTiketsTimerId = setInterval(checkTikets, 100);

        info('已启动 ' + getQueryInfo());
    }

    function status() {
        if (isRunning) {
            info('正在查询 ' + getQueryInfo() + ' ' + submitQueryCount + ' 次 ' + displayTime(new Date().getTime() - startTime));
        } else {
            info('未启动 ' + getQueryInfo());
        }
    }

    function displayTime(millis) {
        var seconds = Math.floor(millis / 1000);
        var h = Math.floor(seconds / 3600);
        seconds = seconds - 3600 * h;
        var m = Math.floor(seconds / 60);
        var s = seconds % 60;

        var str = '';
        if (h > 0) str += h + ' 小时 ';
        if (h > 0 || m > 0) str += m + ' 分 ';
        str += s + ' 秒';
        return str;
    }

    function submitQuery() {
        if (canQuery()) {
            doSubmitQuery();
            submitQueryCount++;
            status();
            lastSubmitQueryTime = new Date().getTime();
        }
    }

    function checkTikets() {

        //符合条件的车次
        var trains = $(resultTrSelector, context).map(function (index, tr) {

            if (trainNumbers.indexOf(getTrainNumber(tr)) == -1) {
                return null;
            }

            var train = new Train(tr);
            return train.total >= names.length
                ?
                train
                :
                null;
        });

        if (orderByFirst == 'seat') {
            //order by 席别, 车次
            trains.sort(function (a, b) {
                for (var i = 0; i < seats.length; i++) {
                    if (a.counts[i] != b.counts[i]) {
                        return b.counts[i] - a.counts[i];
                    }
                }
                return trainNumbers.indexOf(a.number) - trainNumbers.indexOf(b.number);
            });
        } else {
            //order by 车次 席别
            trains.sort(function (a, b) {
                return trainNumbers.indexOf(a.number) - trainNumbers.indexOf(b.number);
            });
        }

        if (trains.length > 0) {
            //优先选together
            if (orderByFirst == 'seat') {
                for (var i = 0; i < trains.length; i++) {
                    var train = trains[i];
                    if (train.together) {
                        push(train.orderSeats, train.together, names.length);
                        found(train);
                        return;
                    }
                }
            }

            //取第一个
            var train = trains[0];

            for (var i = 0; i < train.counts.length; i++) {

                push(train.orderSeats,
                    seats[i],
                    Math.min(train.counts[i], names.length - train.orderSeats.length));

                if (train.orderSeats.length == names.length)
                    break;
            }

            found(train);
        }
    }

    function push(arr, item, repeats) {
        for (var i = 0; i < repeats; i++) {
            arr.push(item);
        }
    }

    function Train(tr) {
        var me = this;
        this.tr = tr;
        this.number = getTrainNumber(tr);
        this.total = 0;
        this.together = null;
        this.seat2count = {};
        this.orderSeats = [];
        this.counts = $.map(seats, function (item, index) {
            count = getSeatCount(tr, item);
            me.total += count;
            me.seat2count[item] = count;

            if (!me.together
                && (item == '软卧' || item == '硬卧')
                && count >= names.length) {
                me.together = item;
            }

            return count;
        });
    }

    function getSeatCount(tr, seat) {
        var count = $.trim($(tr).find('td').eq(seat2tdIndex[seat]).text());

        if (count == '有')
            count = 999;

        if (count == '' || isNaN(count))
            count = 0;
        else
            count = parseInt(count);

        return count;
    }

    function found(train) {
        stop();

        play();

        info("自动选择 " + train.number + ", " + train.orderSeats.length + "张: " + train.orderSeats.join(','));

        $(train.tr).css('background-color', 'cornflowerblue');

        goOrder(train);
    }

    function goOrder(train) { //点击预订按钮
        if (!isGoingOrder) {
            isGoingOrder = true;

            localStorage.order = JSON.stringify({
                seats: train.orderSeats,
                names: names
            });

            info('正在跳转到预订页面..');
            doGoOrder(train.tr);
        }
    }

    function stop() {
        if (submitQueryTimerId) {
            clearInterval(submitQueryTimerId);
            submitQueryTimerId = null;
        }
        if (checkTiketsTimerId) {
            clearInterval(checkTiketsTimerId);
            checkTiketsTimerId = null;
        }
        isRunning = false;
        info('已停止 ' + getQueryInfo());
    }

    function info(msg) {
        console.log(msg);
    }

    function getQueryInfo() {
        return '车次(' + trainNumbers.length + '): ' + trainNumbers.join(',') +
            ' 席别(' + seats.length + '): ' + seats.join(',') +
            ' 乘客(' + names.length + '): ' + names.join(',');
    }

    function ui() {

        var form = $('<form></form>');
        var fieldset = $('<fieldset style="border:1px solid; padding: 20px; background-color: #F5F5DC;">' +
            '<legend><a href="https://github.com/wei345/12306helper" style="color:black">12306helper</a> ' + version + '</legend></fieldset>').appendTo(form);

        var trainNumbersInput = $('<input name="trainNumbers" placeholder="车次，多个以英文逗号分隔" style="width:280px"/>')
            .val(trainNumbers.join(','))
            .appendTo(fieldset);

        var seatsInput = $('<input name="seats" placeholder="席别，多个以英文逗号分隔" style="width:150px; margin-left: 20px;"/>')
            .val(seats.join(','))
            .appendTo(fieldset);

        var namesInput = $('<input name="names" placeholder="乘客名字，多个以英文逗号分隔" style="width:180px; margin-left: 20px;"/>')
            .val(names.join(','))
            .appendTo(fieldset);

        var seatFirstRadio = $('<input name="orderByFirst" id="orderByFirst1" type="radio" value="seat" style="margin-left: 15px"/>').appendTo(fieldset);
        $('<label for="orderByFirst1">席别优先</label>').appendTo(fieldset);
        var trainNumberFirstRadio = $('<input name="orderByFirst" id="orderByFirst2" type="radio" value="trainNumber" style="margin-left: 5px"/>').appendTo(fieldset);
        $('<label for="orderByFirst2">车次优先</label>').appendTo(fieldset);
        if (orderByFirst == 'seat') {
            seatFirstRadio[0].checked = true;
        }
        if (orderByFirst == 'trainNumber') {
            trainNumberFirstRadio[0].checked = true;
        }

        //启动按钮
        $('<input type="button" value="启动" style="margin-left: 20px;"/>').click(function () {

            stop();

            var separator = /\s*,\s*/;

            start(seatsInput.val().split(separator),
                $.trim(trainNumbersInput.val()).toUpperCase().split(separator),
                namesInput.val().split(separator),
                $('[name=orderByFirst]:checked', form).val());


        }).appendTo(fieldset);

        //停止按钮
        $('<input type="button" value="停止" style="margin-left: 20px;"/>').click(stop).appendTo(fieldset);

        //提示
        $('<ul style="margin-left:30px;">' +
            '<li style="list-style-type:disc">你应该提前试试此脚本，选择其他日期、其他车次，</li>' +
            '<li style="list-style-type:disc">验证此脚本功能正常和你输入的乘客名字正确，听听提示音乐是什么。</li>' +
            '<li style="list-style-type:disc">记得刷新页面，检查是否处于登录状态。</li>' +
            '<li style="list-style-type:disc">在起售时间之前3分钟内不要查询，避免在服务端留下缓存，查不到票。</li>' +
            '</ul>').appendTo(fieldset);

        var infoDiv = $('<div style="margin-top: 10px;"></div>').appendTo(fieldset);

        form.insertAfter('.sear-box');

        //运行状态
        var _info = info;
        info = function (msg) {
            _info(msg);
            infoDiv.html(msg);
        };
    }

    return {
        start: start,
        stop: stop,
        status: status,
        debug: {
            goOrder: goOrder,
            checkTikets: checkTikets
        }
    };
})();


//-- 订单提交页 --//
location.pathname == '/otn/confirmPassenger/initDc' && (function () {
    play();
    ui();

    var order = JSON.parse(localStorage.order);
    var seats = order.seats; //各乘客对应的席别
    var names = order.names; //各乘客名

    var checkedNamesCount = 0;
    var selectedSeatsCount = 0;
    var timer = setInterval(fillOrder, 200);

    function fillOrder() {

        if (checkedNamesCount < names.length) {
            info('正在选乘客..');
            checkedNamesCount = 0;
            $.each(names, function (index, name) {
                $('#normal_passenger_id li').each(function () {
                    if ($.trim($(this).text()) == name) {
                        var checkbox = $('input[type=checkbox]', this)[0];
                        if (checkbox) {
                            if (!checkbox.checked) {
                                checkbox.click();
                            }
                            checkedNamesCount++;
                        }
                        return false;
                    }
                });
            });
        }

        if (selectedSeatsCount < names.length) {
            info('正在选席别..');
            selectedSeatsCount = 0;
            $('select[id^=seatType]').each(function (index, item) {
                $(this).find('option').each(function () {
                    var seat = seats[index];
                    if (seat == '无座') seat = '硬座'; //下拉列表中没有'无座'项
                    if ($(this).text().indexOf(seat) != -1) {
                        this.selected = true;
                        selectedSeatsCount++;
                        return false;
                    }
                });
            });
        }


        if (checkedNamesCount == names.length && selectedSeatsCount == names.length) {
            //验证码输入框获得焦点，输入4个字符后立刻提交订单
            $('#randCode').keyup(function () {
                if (this.value.length == 4) {
                    $('#submitOrder_id').focus()[0].click();
                }
            }).mouseover(function () {
                this.focus();
            })[0].focus();

            clearInterval(timer);

            info('已选择乘客和席别，输入4位验证码自动提交订单');
        }
    }

    function info(msg) {
        console.log(msg);
    }

    function ui() {

        var form = $('<form></form>');
        var fieldset = $('<fieldset style="border:1px solid; padding: 20px; background-color: #F5F5DC;">' +
            '<legend><a href="https://github.com/wei345/12306helper" style="color:black">12306helper</a> ' + version + '</legend></fieldset>').appendTo(form);

        var infoDiv = $('<div style="margin-top: 10px;"></div>').appendTo(fieldset);

        form.insertBefore('.layout.person');

        //运行状态
        var _info = info;
        info = function (msg) {
            _info(msg);
            infoDiv.html(msg);
        };
    }
})();




