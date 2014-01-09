/*
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
  h.start('硬卧', [1458, 'k1190'], '张三');                      //一种席别，多个车次，一个乘客
  h.start(['硬卧', '软卧'], [1458, 'k1190'], ['张三', '李四']);  //多个席别，多个车次，多个乘客
  
  h.status();                                                    //显示运行状态和缺省参数
  h.stop();                                                      //停止

5. 你应该提前试试此脚本，选择其他日期、其他车次，验证此脚本功能正常

浏览器最小化，该程序也会正常运行。

@author: Liu Wei
*/

var version = chrome.runtime.getManifest().version;

//车票查询页和订单提交页都会用到
var audioTag = null;
var sound = 'http://static.liebao.cn/resources/audio/song25.ogg'; //没有设置正确的 content-type,  Firefox和Safari不能播放该文件
function play(){
  if(!audioTag) audioTag = $('<audio controls autoplay loop>  <source src="'+ sound +'" type="audio/mpeg"></audio>');
}

//车票查询页
location.pathname == '/otn/leftTicket/init' && (function(){

  var query = localStorage.query ? JSON.parse(localStorage.query) : {trainNumbers : [], seats : [], names : []};
  var trainNumbers = query.trainNumbers;
  var seats = query.seats;
  var names = query.names;

  //解析12306车票预订页面
  var context = document.body;
  var resultTrSelector = '#t-list table tbody tr[id^=ticket_]';
  var queryButton = $('#query_ticket', context);
  var seat2tdIndex = {
    '硬卧' : 7,
    '软卧' : 6,
    '高级软卧' : 5,
    '硬座' : 9,
    '无座' : 10
  };
  function doGoOrder(tr){
    $('td:eq(12) a', tr)[0].click();
  }
  function getTrainNumber(tr){
    return $('td:first .ticket-info .train div a', tr).text();
  }
  function canQuery(){
    return queryButton.text() == '查询' 
      && (!lastSubmitQueryTime || (new Date().getTime() - lastSubmitQueryTime) > 3000); //两次查询至少间隔3秒，用于查票
  }
  function doSubmitQuery(){
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

  function start(mySeats, myTrainNumbers, myNames){
    if(isRunning){
      status();
      return;
    }

    submitQueryCount = 0;
    isRunning = true;
    startTime = new Date().getTime();
    isGoingOrder = false;

    if(mySeats) seats = (mySeats instanceof Array ? mySeats : [mySeats]);
    if(myTrainNumbers) trainNumbers = (myTrainNumbers instanceof Array ? myTrainNumbers : [myTrainNumbers]);
    if(myNames) names = (myNames instanceof Array ? myNames : [myNames]);

    localStorage.query = JSON.stringify({
      trainNumbers : trainNumbers,
      seats : seats,
      names : names
    });

    submitQueryTimerId = setInterval(submitQuery, 1000);
    checkTiketsTimerId = setInterval(checkTikets, 1000);

    info('已启动 ' + getQueryInfo());
  }

  function status(){
    if(isRunning){
      info('正在查询 ' + getQueryInfo() + ' ' + submitQueryCount + ' 次 ' + displayTime(new Date().getTime() - startTime));
    }else{
      info('未启动 ' + getQueryInfo());
    }
  }

  function displayTime(millis){ 
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

  function submitQuery(){
    if(canQuery()){
      doSubmitQuery();
      submitQueryCount++;
      status();
      lastSubmitQueryTime = new Date().getTime();
    }
  }

  function checkTikets(){
    //如果已不再刷新，且最后一次提交已过去1分钟，则停止检查
    if(!submitQueryTimerId && lastSubmitQueryTime && (new Date().getTime() - lastSubmitQueryTime)/1000 > 60){
      stop();
    }

    //选择的车次并且座位够数
    var trains = $(resultTrSelector, context).map(function(index, tr){

      if(trainNumbers.indexOf(getTrainNumber(tr)) == -1) 
        return null;

      var train = new Train(tr);

      return train.total >= names.length
          ?
          train
          :
          null;
    });

    //order by 席别, 车次
    trains.sort(function(a, b){
      for(var i = 0; i < seats.length; i++){
        if(a.counts[i] != b.counts[i])
          return b.counts[i] - a.counts[i];
      }
      return trainNumbers.indexOf(a.number) - trainNumbers.indexOf(b.number);
    });

    if(trains.length > 0){
      //查找together
      for(var i = 0; i < trains.length; i++){
        var train = trains[i];
        if(train.together){
          push(train.orderSeats, train.together, names.length);
          alert(train);
          return;
        }
      }
      
      //第一个就是最合适的
      var train = trains[0];
      
      for(var i = 0; i < train.counts.length; i++){
        
        push(train.orderSeats, 
          seats[i], 
          Math.min(train.counts[i], names.length - train.orderSeats.length));
        
        if(train.orderSeats.length == names.length)
          break;
      }

      alert(train);
    }
  }

  function push(arr, item, repeats){
    for(var i = 0; i < repeats; i++){
      arr.push(item);
    }
  }

  function Train(tr){
    var me = this;
    this.tr = tr;
    this.number = getTrainNumber(tr);
    this.total = 0;
    this.together = null;
    this.seat2count = {};
    this.orderSeats = [];
    this.counts = $.map(seats, function(item, index){
      count = getSeatCount(tr, item);
      me.total += count;
      me.seat2count[item] = count;

      if(!me.together 
          && (item == '软卧' || item == '硬卧') 
          && count >= names.length){
        me.together = item;
      }

      return count;
    });
  }

  function getSeatCount(tr, seat){
    var count = $.trim($(tr).find('td').eq(seat2tdIndex[seat]).text());
    
    if(count == '有')
      count = 999;
    
    if(count == '' || isNaN(count))
      count = 0;
    else
      count = parseInt(count);
    
    return count;
  }

  function alert(train){
    var msg = "自动选择 " + train.number + ", " + train.orderSeats.length + "张: " + train.orderSeats.join(',');
    var tr = train.tr;

    if(!$(tr).attr('alreadyAlert')){
      $(tr).attr('alreadyAlert', true);
      if(submitQueryTimerId) {
        clearInterval(submitQueryTimerId);
        submitQueryTimerId = null;
      }
      info(msg);
      play();
      $(tr).css('background-color', 'cornflowerblue');

      goOrder(tr, train.orderSeats);
    }
  }

  function goOrder(tr, seats){ //点击预订按钮
    if(!isGoingOrder){
      isGoingOrder = true;

      var order = {
        seats : seats,
        names : names
      };
      
      localStorage.order = JSON.stringify(order);

      info('正在跳转到预订页面..');
      doGoOrder(tr);
    }
  }

  function stop(){
    if(submitQueryTimerId) {
      clearInterval(submitQueryTimerId);
      submitQueryTimerId = null;
    }
    if(checkTiketsTimerId) {
      clearInterval(checkTiketsTimerId);
      checkTiketsTimerId = null;
    }
    isRunning = false;
    info('已停止 ' + getQueryInfo());
  }

  function info(msg){
    console.log(msg);
  }

  function getQueryInfo(){
    return '车次('+ trainNumbers.length +'): ' + trainNumbers.join(',') + 
      ' 席别('+ seats.length +'): ' + seats.join(',') + 
      ' 乘客('+ names.length +'): ' + names.join(',');
  }

  function ui(){

    var form = $('<form></form>');
    var fieldset = $('<fieldset style="border:1px solid; padding: 20px; background-color: #F5F5DC;">'+
      '<legend><a href="https://github.com/wei345/12306helper" style="color:black">12306helper</a> '+ version +'</legend></fieldset>').appendTo(form);
    
    var trainNumbersInput = $('<input name="trainNumbers" placeholder="车次，多个以英文逗号分隔" style="width:200px"/>')
      .val(query.trainNumbers.join(','))
      .appendTo(fieldset);
    
    var seatsInput = $('<input name="seats" placeholder="席别，多个以英文逗号分隔" style="width:200px; margin-left: 20px;"/>')
      .val(query.seats.join(','))
      .appendTo(fieldset);
    
    var namesInput = $('<input name="names" placeholder="乘客名字，多个以英文逗号分隔" style="width:200px; margin-left: 20px;"/>')
      .val(query.names.join(','))
      .appendTo(fieldset);

    //启动按钮
    $('<input type="button" value="启动" style="margin-left: 20px;"/>').click(function(){

      stop();

      var separator = /\s*,\s*/;

      start(seatsInput.val().split(separator), 
        trainNumbersInput.val().split(separator), 
        namesInput.val().split(separator));

    }).appendTo(fieldset);

    //停止按钮
    $('<input type="button" value="停止" style="margin-left: 20px;"/>').click(stop).appendTo(fieldset);

    //提示
    $('<ul style="margin-left:30px;">'+
      '<li style="list-style-type:disc">你应该提前试试此脚本，选择其他日期、其他车次，</li>'+
      '<li style="list-style-type:disc">验证此脚本功能正常和你输入的乘客名字正确，</li>'+
      '<li style="list-style-type:disc">听听提示音乐是什么</li>'+
      '</ul>').appendTo(fieldset);

    var infoDiv = $('<div style="margin-top: 10px;"></div>').appendTo(fieldset);
    
    form.insertAfter('.sear-box');
    
    //运行状态
    var _info = info;
    info = function(msg){
      _info(msg);
      infoDiv.html(msg);
    };

  }

  return {
    start : start,
    stop : stop,
    status : status,
    debug : {
      goOrder : goOrder,
      checkTikets : checkTikets
    }
  };
})();


//-- 订单提交页 --//
location.pathname == '/otn/confirmPassenger/initDc' && (function(){
  play();

  var order = JSON.parse(localStorage.order);
  var seats = order.seats;
  var names = order.names;

  var timer = setInterval(fillOrder, 200);

  function fillOrder(){
    var allChecked = true;

    console.log('正在选乘客..');
    $.each(names, function(index, item){
      var checkbox = $('#normal_passenger_id input[type=checkbox][id*='+ item +']')[0];
        if(checkbox) {
          if(!checkbox.checked) checkbox.click();
        } else {
          allChecked = false;
        }
    });

    if(allChecked){

      console.log('正在选席别..');
      $('select[id^=seatType]').each(function(index, item){
        $(this).find('option').each(function(){
          var seat = seats[index];
          if(seat == '无座') seat = '硬座'; //下拉列表中没有'无座'项
          if($(this).text().indexOf(seat) != -1){
            this.selected = true;
            return false;
          }
        });
      });

      //验证码输入框获得焦点，输入4个字符后立刻提交订单
      $('#randCode').keyup(function(){
        if(this.value.length == 4){
          $('#submitOrder_id').focus()[0].click();
        }
      }).mouseover(function(){
        this.select();
      })[0].focus();

      clearInterval(timer);
    }
  }
})();




