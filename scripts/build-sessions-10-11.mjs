import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const book = "/Volumes/SamsungSSD/CodexPJ/EBook/books/Amy小学五年级英语词汇";
const sourcePath = path.join(book, "第10-11次英文待确认.json");
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

const i = (term, meaningZh, example, exampleZh, acceptedMeaningsZh = []) => ({ term, meaningZh, example, exampleZh, acceptedMeaningsZh });

const s10 = {
  1:[i("computer","电脑","This computer is new.","这台电脑是新的。"),i("play computer games","玩电脑游戏","I play computer games on Sunday.","我星期天玩电脑游戏。")],
  2:[i("quiz","小测验","We have a quiz today.","我们今天有一次小测验。"),i("make a quiz","编一份测验","The teacher will make a quiz.","老师会编一份测验。")],
  3:[i("click","点击","Click the blue button.","点击蓝色按钮。")],4:[i("delete","删除","Please delete this photo.","请删除这张照片。")],
  5:[i("password","密码","Do not tell others your password.","不要把密码告诉别人。")],
  6:[i("store","储存；商店","Computers store information.","电脑储存信息。",["保存；商店"])],
  7:[i("search","搜索；查找","I search the Internet for facts.","我在网上搜索资料。")],
  8:[i("information","信息；资料","The book has useful information.","这本书里有有用的信息。"),i("search for information","搜索信息","We search for information online.","我们在网上搜索信息。")],
  9:[i("desktop","台式电脑；桌面","The desktop is in the study.","台式电脑在书房里。")],10:[i("laptop","笔记本电脑","Her laptop is very light.","她的笔记本电脑很轻。")],
  11:[i("fact","事实","This is an interesting fact.","这是一个有趣的事实。"),i("facts","多个事实；资料","I found three facts about whales.","我找到了三个关于鲸的事实。")],
  12:[i("as ... as ...","和……一样……","My bag is as light as yours.","我的书包和你的一样轻。")],
  13:[i("problem","问题；难题","We can solve this problem.","我们能解决这个问题。")],
  14:[i("statement","陈述；说法","Read the statement carefully.","仔细阅读这条陈述。"),i("statements","多条陈述；说法","Check the two statements.","检查这两条陈述。")],
  15:[i("enemy","敌人","The dragon is not our enemy.","这条龙不是我们的敌人。"),i("an enemy","一个敌人","He saw an enemy near the gate.","他在门附近看见了一个敌人。")],
  16:[i("should","应该","You should finish your homework.","你应该完成作业。"),i("should be used","应该被使用","This tool should be used carefully.","这个工具应该小心使用。")],
  17:[i("birth","出生","The story tells us about his birth.","这个故事告诉我们他的出生情况。"),i("birthday","生日","Today is my birthday.","今天是我的生日。"),i("birth date","出生日期","Write your birth date here.","在这里写下你的出生日期。")],
  18:[i("create","创建；创造","We can create a new file.","我们可以创建一个新文件。")],19:[i("button","按钮","Press the green button.","按下绿色按钮。")],
  20:[i("store information","储存信息","A computer can store information.","电脑可以储存信息。")],
  21:[i("a file","一个文件","I saved a file on the computer.","我在电脑上保存了一个文件。"),i("delete a file","删除一个文件","Do not delete a file by mistake.","不要误删文件。")],
  22:[i("Recycle Bin","回收站","The deleted file is in the Recycle Bin.","删除的文件在回收站里。")],23:[i("computer screen","电脑屏幕","The words are on the computer screen.","这些字在电脑屏幕上。")],
  24:[i("check","检查","Please check your answers.","请检查你的答案。"),i("check homework","检查作业","Dad helps me check homework.","爸爸帮我检查作业。")],
  25:[i("system","系统","The computer system is ready.","电脑系统准备好了。")],
  26:[i("True (T)","正确（用 T 表示）","Write True (T) if the statement is right.","如果陈述正确，就写 True（T）。"),i("False (F)","错误（用 F 表示）","Write False (F) if the statement is wrong.","如果陈述错误，就写 False（F）。")],
  27:[i("ENIAC","埃尼阿克（早期电子计算机）","ENIAC was an early computer.","埃尼阿克是一台早期电子计算机。")],
  28:[i("the well-known","那个著名的","The well-known story is true.","那个著名的故事是真的。"),i("the best-known","那个最著名的","This is the best-known computer here.","这是这里最著名的电脑。"),i("good","好的","This is a good idea.","这是一个好主意。"),i("well","好地","She sings well.","她唱得很好。"),i("better","更好的；更好地","This computer works better.","这台电脑运行得更好。"),i("best","最好的；最好地","Amy did the best in the quiz.","艾米在小测验中表现最好。")],
  29:[i("key","键；钥匙","Press any key to start.","按任意键开始。"),i("keyboard","键盘","The keyboard is beside the screen.","键盘在屏幕旁边。")],
  30:[i("don't","不；不要（用于 I、you、we、they）","I don't know the password.","我不知道密码。"),i("doesn't","不（用于 he、she、it）","She doesn't use this laptop.","她不用这台笔记本电脑。"),i("didn't","没有（过去时）","We didn't play games yesterday.","我们昨天没有玩游戏。")],
  31:[i("It is","它是；现在是","It is a new computer.","它是一台新电脑。"),i("It was","它过去是；当时是","It was very big.","它过去很大。")],
  32:[i("as + adj. / adv. + as ...","和……一样……","This laptop is as light as that one.","这台笔记本电脑和那台一样轻。"),i("not as + adj. / adv. + as ...","不如……那样……","This old computer is not as fast as the new one.","这台旧电脑不如新电脑快。")],
  33:[i("beside","在……旁边","The mouse is beside the keyboard.","鼠标在键盘旁边。"),i("besides","除……之外还；而且","Besides English, I study Chinese.","除了英语，我还学习语文。")],
  34:[i("ton","吨","The machine weighs one ton.","这台机器重一吨。"),i("tons","多吨","The old computer weighed many tons.","那台旧电脑重很多吨。"),i("50 tons","五十吨","ENIAC weighed about 50 tons.","埃尼阿克重约五十吨。")],
  35:[i("as big as an elephant","和一头大象一样大","The machine is as big as an elephant.","这台机器和一头大象一样大。"),i("as heavy as four elephants","和四头大象一样重","It is as heavy as four elephants.","它和四头大象一样重。")],
  36:[i("different","不同的","The two computers are different.","这两台电脑不同。"),i("difficult","困难的","This maths question is difficult.","这道数学题很难。")],
  37:[i("task","任务","I finished the task.","我完成了任务。"),i("maths tasks","数学任务；数学题","The computer can do maths tasks.","电脑可以完成数学任务。"),i("difficult tasks","困难的任务","It can finish difficult tasks.","它可以完成困难的任务。")],
  38:[i("microchip","微芯片","A microchip is very small.","微芯片非常小。")],39:[i("make","制作；使得","We make a paper plane.","我们制作一架纸飞机。"),i("made","制作了；使得了（make 的过去式）","Dad made a small robot.","爸爸做了一个小机器人。")],
  40:[i("are","是（现在时复数）","These computers are fast.","这些电脑很快。"),i("were","过去是（are 的过去式）","The old computers were large.","旧电脑过去很大。")],
  41:[i("salt","盐","Please add a little salt.","请加一点盐。"),i("a grain of salt","一粒盐","The chip is as small as a grain of salt.","这块芯片和一粒盐一样小。")],
  42:[i("How amazing!","太神奇了！","How amazing! The tiny chip can do so much.","太神奇了！这块小芯片能做这么多事。")],
  43:[i("email","电子邮件","I got an email from Amy.","我收到了一封艾米发来的电子邮件。"),i("an email","一封电子邮件","Please write an email to me.","请给我写一封电子邮件。"),i("send emails","发送电子邮件","We use computers to send emails.","我们用电脑发送电子邮件。")],
  44:[i("good","好的","This is a good computer.","这是一台好电脑。"),i("well","好地","The computer works well.","这台电脑运行得很好。"),i("better","更好的；更好地","The new one works better.","新电脑运行得更好。")],
  45:[i("as ...","作为……","She works as a teacher.","她是一名老师。"),i("as a gift","作为礼物","I got the book as a gift.","我收到这本书作为礼物。")],
  46:[i("turn on","打开（电器）","Turn on the computer, please.","请打开电脑。"),i("turn off","关闭（电器）","Turn off the light before bed.","睡觉前关灯。")],
  47:[i("mess","混乱；脏乱","My desk is a mess.","我的书桌一团糟。"),i("mess up","弄乱；搞砸","Do not mess up the files.","不要弄乱这些文件。")],
  48:[i("need to do ...","需要做……","I need to finish my homework.","我需要完成作业。")],
  49:[i("power on","开机；接通电源","Power on the computer first.","先给电脑开机。"),i("shut down","关机；关闭","Please shut down the computer.","请把电脑关机。"),i("power off","关闭电源","Power off the screen after use.","使用后关闭屏幕电源。")],
  50:[i("letter","字母；信","Type a letter here.","在这里输入一个字母。"),i("number","数字；号码","My password has one number.","我的密码里有一个数字。"),i("symbol","符号","Add a symbol to the password.","在密码中加一个符号。")],
  51:[i("tell others","告诉别人","Do not tell others my password.","不要把我的密码告诉别人。")],
  52:[i("luck","运气","We need a little luck.","我们需要一点运气。"),i("Good luck!","祝你好运！","Good luck with your quiz!","祝你小测验顺利！"),i("lucky","幸运的","I am lucky to have your help.","有你的帮助，我很幸运。")],
  53:[i("care","关心；照料","Parents care about their children.","父母关心孩子。"),i("take care of","照顾","I take care of my little brother.","我照顾我的弟弟。"),i("careful","小心的；仔细的","Be careful with the laptop.","使用笔记本电脑时要小心。"),i("carefully","小心地；仔细地","Read the question carefully.","仔细读题。"),i("careless","粗心的","A careless mistake can cause trouble.","一个粗心的错误会带来麻烦。"),i("carelessly","粗心地","Do not use the computer carelessly.","不要粗心地使用电脑。")],
  54:[i("drop","使掉落；掉下","Do not drop your phone.","不要把手机掉在地上。"),i("dropped","掉落了（drop 的过去式）","I dropped some water on the desk.","我把一些水洒在了桌上。")],
  55:[i("leave it to dry","把它放着晾干","Leave it to dry before you use it.","使用前先把它放着晾干。")],56:[i("be worried","担心","Do not be worried about the test.","不要担心考试。")],
  57:[i("ask sb. to do","让某人做……；请求某人做……","I ask Dad to help me.","我请爸爸帮我。"),i("ask my mother to help me ...","请妈妈帮我……","I ask my mother to help me clean it.","我请妈妈帮我把它清理干净。")],
  58:[i("while","当……时；一段时间","Be careful while you work.","工作时要小心。"),i("while doing ...","在做……时","Do not eat while doing homework.","做作业时不要吃东西。"),i("while using ...","在使用……时","Sit straight while using a computer.","使用电脑时要坐直。")],
  59:[i("in the future","将来","Computers will be smaller in the future.","将来的电脑会更小。")],
  60:[i("used","用过的；二手的","This is a used computer.","这是一台用过的电脑。"),i("unused","未使用的","The unused paper is still clean.","未使用的纸仍然很干净。")],
  61:[i("program","程序；编程","This program helps me draw.","这个程序帮助我画画。")],
  62:[i("necessary","必要的","A strong password is necessary.","强密码是必要的。"),i("unnecessary","不必要的","Delete unnecessary files.","删除不必要的文件。")],
  63:[i("update","更新","Please update the program.","请更新这个程序。")],64:[i("immediately","立刻；马上","Turn it off immediately.","立刻把它关掉。")],65:[i("restart","重新启动","Restart the computer after the update.","更新后重新启动电脑。")],
  66:[i("virus","病毒","A virus can hurt your computer.","病毒会损害你的电脑。"),i("viruses","多种病毒","This program can find viruses.","这个程序能查找病毒。")],
  67:[i("keep in mind","记住","Keep in mind that passwords are private.","记住密码是私密的。")],68:[i("fill in","填写","Please fill in your name.","请填写你的姓名。")],
  69:[i("template","模板","Choose a template for the card.","为卡片选择一个模板。"),i("templates","多个模板","The program has many templates.","这个程序有许多模板。")],
  70:[i("in the corner","在角落里","The button is in the corner.","按钮在角落里。")],71:[i("share ... with ...","与……分享……","I share my photos with Mum.","我和妈妈分享我的照片。")]
};

const s11 = {
  1:[i("green","绿色的；环保的","We want a green school.","我们想要一所环保的学校。")],2:[i("greener","更绿色的；更环保的","Let us make our city greener.","让我们让城市更环保。")],
  3:[i("booklet","小册子","This booklet is about recycling.","这本小册子是关于回收利用的。")],
  4:[i("use","使用","We use both sides of the paper.","我们使用纸的两面。"),i("reuse","再次使用","We can reuse this bag.","我们可以重复使用这个袋子。")],
  5:[i("reduce","减少","We should reduce waste.","我们应该减少浪费。"),i("reduce costs","降低成本","Reusing things can reduce costs.","重复使用物品可以降低成本。")],
  6:[i("recycle","回收利用","We recycle paper and bottles.","我们回收利用纸和瓶子。")],
  7:[i("throw","扔；投","Do not throw stones.","不要扔石头。"),i("throw away","扔掉","Do not throw away this box.","不要扔掉这个盒子。")],
  8:[i("pick up","捡起；拿起","Please pick up the rubbish.","请捡起垃圾。")],
  9:[i("turn off","关闭（电器）","Turn off the lights when you leave.","离开时关灯。"),i("turn on","打开（电器）","Turn on the television, please.","请打开电视。")],
  10:[i("pollute","污染","Dirty water can pollute the river.","脏水会污染河流。"),i("pollution","污染","Air pollution is bad for us.","空气污染对我们有害。")],
  11:[i("habit","习惯","Walking is a healthy habit.","步行是一个健康的习惯。"),i("habits for ...","适合……的习惯；关于……的习惯","The booklet shows good habits for a green life.","这本小册子介绍环保生活的好习惯。")],
  12:[i("a good way","一个好方法","Walking is a good way to stay healthy.","步行是保持健康的好方法。"),i("It's a good way to do ...","这是做……的好方法","It's a good way to save water.","这是节约用水的好方法。")],
  13:[i("take","乘坐；拿","I take my bag to school.","我把书包带到学校。"),i("take a bus","乘公共汽车","I take a bus to school.","我乘公共汽车上学。"),i("take a car","乘小汽车","We take a car to the park.","我们乘小汽车去公园。"),i("take the subway","乘地铁","They take the subway to work.","他们乘地铁上班。")],
  14:[i("walk to ...","步行去……","I walk to school every day.","我每天步行上学。"),i("go to ... on foot","步行去……","We go to the library on foot.","我们步行去图书馆。")],
  15:[i("It's a good way to do ...","这是做……的好方法","It's a good way to save energy.","这是节约能源的好方法。"),i("It's a great way to do ...","这是做……的好办法","It's a great way to keep fit.","这是保持健康的好办法。")],
  16:[i("give sth. to sb.","把某物给某人","Please give the book to Amy.","请把书给艾米。"),i("give the meat to the dog","把肉给狗","I give the meat to the dog.","我把肉给狗。"),i("give them to the girls","把它们给女孩们","Please give them to the girls.","请把它们给女孩们。")],
  17:[i("little kids","小孩子们","Little kids like these toys.","小孩子们喜欢这些玩具。")],
  18:[i("play with sth.","玩某物","Do not play with fire.","不要玩火。"),i("play with the toys","玩这些玩具","The children play with the toys.","孩子们玩这些玩具。")],
  19:[i("plastic","塑料；塑料的","This bottle is made of plastic.","这个瓶子是塑料做的。"),i("plastic bag","塑料袋","Do not use too many plastic bags.","不要使用太多塑料袋。")],
  20:[i("cloth","布；布料","This bag is made of cloth.","这个袋子是布做的。")],21:[i("paper","纸","Please use less paper.","请少用纸。")],
  22:[i("tap","水龙头","The tap is still on.","水龙头还开着。"),i("turn on the tap","打开水龙头","Turn on the tap to wash your hands.","打开水龙头洗手。"),i("turn off the tap","关掉水龙头","Turn off the tap after washing.","洗完后关掉水龙头。")],
  23:[i("brush my teeth","刷牙","I brush my teeth twice a day.","我每天刷两次牙。")],24:[i("save water","节约用水","We should save water every day.","我们每天都应该节约用水。")],
  25:[i("side","一面；一边","Write on this side of the paper.","写在纸的这一面。"),i("both sides","两面","The paper has words on both sides.","这张纸两面都有字。"),i("both sides of the paper","纸的两面","Use both sides of the paper.","使用纸的两面。")],
  26:[i("I see.","我明白了。","I see. We should use less paper.","我明白了。我们应该少用纸。")],
  27:[i("be made of ...","由……制成（看得出原材料）","The chair is made of wood.","这把椅子是木头制成的。"),i("be made from ...","由……制成（看不出原材料）","Paper is made from wood.","纸是由木材制成的。")],
  28:[i("The desk is made of wood.","这张书桌是木头制成的。","The desk is made of wood.","这张书桌是木头制成的。"),i("Paper is made from wood.","纸是由木材制成的。","Paper is made from wood.","纸是由木材制成的。")],
  29:[i("paper","纸","We need paper for the poster.","我们做海报需要纸。"),i("little paper","很少的纸","There is little paper in the box.","盒子里几乎没有纸。"),i("less paper","更少的纸","We should use less paper.","我们应该少用纸。")],
  30:[i("save","节省；挽救","We can save energy at home.","我们可以在家节约能源。")],
  31:[i("remind","提醒；使想起","This photo can remind me of our trip.","这张照片能让我想起我们的旅行。"),i("remind sb. to do sth.","提醒某人做某事","Please remind me to turn off the light.","请提醒我关灯。"),i("remind sb. of sth.","使某人想起某事","The song reminds me of my school.","这首歌让我想起学校。"),i("remind my mum to buy a cake","提醒妈妈买蛋糕","I remind my mum to buy a cake.","我提醒妈妈买蛋糕。"),i("remind me of my classmates","让我想起同学们","These photos remind me of my classmates.","这些照片让我想起同学们。")],
  32:[i("unplug","拔掉插头","Unplug the television after use.","使用后拔掉电视插头。")],
  33:[i("after doing ...","做完……之后","Wash your hands after playing outside.","在外面玩后要洗手。"),i("after watching TV","看完电视后","Unplug it after watching TV.","看完电视后拔掉插头。")],
  34:[i("energy","能源；能量","The sun gives us energy.","太阳给我们能量。"),i("save energy","节约能源","Turn off the lights to save energy.","关灯可以节约能源。")],
  35:[i("air pollution","空气污染","Cars can cause air pollution.","汽车会造成空气污染。")],
  36:[i("habit","习惯","Reading every day is a good habit.","每天阅读是一个好习惯。"),i("a healthy habit","一个健康的习惯","Going to bed early is a healthy habit.","早睡是一个健康的习惯。")],
  37:[i("plant seeds","播种","We plant seeds in the garden.","我们在花园里播种。")],38:[i("watch them grow","看着它们生长","We water the flowers and watch them grow.","我们给花浇水，看着它们生长。")],
  39:[i("keep sth. adj.","使某物保持……","Trees keep our city cool.","树木让我们的城市保持凉爽。"),i("keep the air clean","保持空气清洁","Trees help keep the air clean.","树木帮助保持空气清洁。"),i("keep the air fresh","保持空气清新","Plants can keep the air fresh.","植物可以保持空气清新。")],
  40:[i("before doing ...","做……之前","Wash your hands before eating.","吃饭前要洗手。"),i("after doing ...","做……之后","Turn off the tap after washing.","洗完后关掉水龙头。")],
  41:[i("throw away ...","扔掉……","Do not throw away useful things.","不要扔掉有用的东西。"),i("throw it away","把它扔掉","The bottle is useful, so don't throw it away.","这个瓶子有用，所以不要把它扔掉。")],
  42:[i("rubbish","垃圾","Put the rubbish in the bin.","把垃圾放进垃圾桶。"),i("rubbish bin","垃圾桶","The rubbish bin is near the door.","垃圾桶在门旁边。"),i("sort rubbish","垃圾分类","We sort rubbish at school.","我们在学校进行垃圾分类。")],
  43:[i("drop","使落下；投放","Do not drop rubbish on the ground.","不要把垃圾扔在地上。"),i("drop ... into","把……投进……","Drop the bottle into the right bin.","把瓶子投进正确的垃圾桶。")],
  44:[i("whale","鲸","A whale lives in the sea.","鲸生活在海里。")],45:[i("eat up","吃光","Please eat up your lunch.","请把午饭吃光。"),i("eat it up","把它吃光","The turtle may eat it up.","海龟可能会把它吃掉。")],
  46:[i("jellyfish","水母","A jellyfish swims in the sea.","一只水母在海里游。")],47:[i("sneeze","打喷嚏","Dust can make me sneeze.","灰尘会让我打喷嚏。")],
  48:[i("open ... wide","把……张大；打开得很大","Open your mouth wide.","把嘴巴张大。")],
  49:[i("turtle","海龟；龟","The turtle swims slowly.","海龟慢慢地游。"),i("tortoise","陆龟","The tortoise walks on land.","陆龟在陆地上行走。")],
  50:[i("spot","发现；认出","I can spot a whale in the sea.","我能在海里发现一头鲸。")],
  51:[i("swallow","吞咽；燕子","Do not swallow the plastic bag.","不要吞下塑料袋。")],
  52:[i("make sb. ill","使某人生病","Dirty water can make us ill.","脏水会使我们生病。")],
  53:[i("cough","咳嗽","The smoke makes me cough.","烟使我咳嗽。"),i("cough hard","剧烈咳嗽","He began to cough hard.","他开始剧烈咳嗽。")],
  54:[i("at once","立刻；马上","Go home at once.","马上回家。")],55:[i("wave","波浪；挥手","A big wave carried the bottle away.","一个大浪把瓶子冲走了。")],
  56:[i("carry","搬运；携带","I carry my bag to school.","我背着书包上学。"),i("carries","搬运；携带（第三人称单数）","The river carries rubbish to the sea.","河流把垃圾带到海里。")],
  57:[i("beach","海滩","The beach is clean today.","今天海滩很干净。"),i("on the beach","在海滩上","We pick up rubbish on the beach.","我们在海滩上捡垃圾。"),i("at the beach","在海滩","We had fun at the beach.","我们在海滩玩得很开心。")],
  58:[i("lie","躺；位于","The cat likes to lie in the sun.","猫喜欢躺在阳光下。"),i("lie around","到处乱放；散落","Plastic bags lie around on the beach.","塑料袋散落在海滩上。")],
  59:[i("throw the rubbish away","把垃圾扔掉","Please throw the rubbish away.","请把垃圾扔掉。"),i("throw the box away","把盒子扔掉","Do not throw the box away.","不要把盒子扔掉。")],
  60:[i("gift","礼物","This book is a gift from Mum.","这本书是妈妈送的礼物。"),i("get gifts","收到礼物","Children get gifts on their birthdays.","孩子们在生日时收到礼物。")],
  61:[i("collect","收集","We collect old paper at school.","我们在学校收集废纸。"),i("collect the boxes","收集这些盒子","Let's collect the boxes for reuse.","让我们收集这些盒子再利用。")]
};

function buildSession(sessionSource, definitions) {
  const groups = sessionSource.groups.map((group) => {
    const rows = definitions[Number(group.teacherNumber)];
    if (!rows?.length) throw new Error(`Missing session ${sessionSource.number} group ${group.teacherNumber}`);
    const items = rows.map((row, index) => ({
      ...row,
      acceptedMeaningsZh: [...new Set([row.meaningZh, ...(row.acceptedMeaningsZh || [])])],
      relation: rows.length === 1 ? "single" : "related",
      id: `${group.id}-i${index + 1}`,
      sourceGroupId: group.id,
      session: sessionSource.number,
      teacherNumber: String(group.teacherNumber),
      displayNumber: rows.length === 1 ? String(group.teacherNumber) : `${group.teacherNumber}-${index + 1}`
    }));
    return { id: group.id, teacherNumber: String(group.teacherNumber), sourceText: group.sourceText, sourceFile: group.sourceFile, items };
  });
  const entries = groups.flatMap((group) => group.items);
  return { number: sessionSource.number, available: true, verifiedEnglish: true, groupCount: groups.length, itemCount: entries.length, groups, entries };
}

const built = source.sessions.map((session) => buildSession(session, session.number === 10 ? s10 : s11));
for (const session of built) {
  fs.writeFileSync(path.join(repo, `public/data/books/amy-grade-5-vocabulary/sessions/session-${session.number}.json`), JSON.stringify(session, null, 2) + "\n");
}

const contentPath = path.join(repo, "public/data/books/amy-grade-5-vocabulary/content.json");
const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
content.version = "20260820-1";
content.sessions = content.sessions.map((session) => built.find((item) => item.number === session.number) || session);
fs.writeFileSync(contentPath, JSON.stringify(content, null, 2) + "\n");

const learningPath = path.join(book, "词汇学习内容.json");
const learning = JSON.parse(fs.readFileSync(learningPath, "utf8"));
learning.version = "20260820-1";
learning.sessions = learning.sessions.filter((session) => session.number < 10);
learning.sessions.push(...built.map((session) => ({
  number: session.number,
  groups: session.groups.map((group) => ({
    groupId: group.id,
    teacherNumber: group.teacherNumber,
    sourceText: group.sourceText,
    sourceFile: group.sourceFile,
    items: group.items.map(({ id, sourceGroupId, session: _session, teacherNumber: _number, displayNumber, ...item }) => ({ id, sourceGroupId, displayNumber, ...item }))
  }))
})));
fs.writeFileSync(learningPath, JSON.stringify(learning, null, 2) + "\n");

const reviewPath = path.join(book, "词汇复习清单.md");
let review = fs.readFileSync(reviewPath, "utf8").replace(/\n## 第 10 次[\s\S]*$/, "").trimEnd();
for (const session of built) {
  review += `\n\n## 第 ${session.number} 次\n`;
  for (const group of session.groups) {
    review += `\n### ${group.teacherNumber}. ${group.sourceText}\n\n`;
    review += "| 英文 | 中文 |\n|---|---|\n";
    for (const item of group.items) review += `| ${item.term.replaceAll("|", "\\|")} | ${item.meaningZh.replaceAll("|", "\\|")} |\n`;
    for (const item of group.items) review += `\n- **${item.term}**: ${item.example}\n  - ${item.exampleZh}\n`;
  }
}
fs.writeFileSync(reviewPath, review.trimEnd() + "\n");

const calibrationPath = path.join(book, "词汇人工校对.json");
const calibration = JSON.parse(fs.readFileSync(calibrationPath, "utf8")).filter((session) => session.number < 10);
calibration.push(...source.sessions.map((session) => ({ number: session.number, entries: session.groups.map((group) => [Number(group.teacherNumber), group.sourceText]) })));
fs.writeFileSync(calibrationPath, JSON.stringify(calibration, null, 2) + "\n");

const confirmedPath = path.join(book, "第10-11次英文已确认.json");
fs.writeFileSync(confirmedPath, JSON.stringify({ ...source, stage: "enriched", verifiedEnglish: true, enrichedAt: new Date().toISOString(), sessions: source.sessions.map((session) => ({ ...session, itemCount: built.find((item) => item.number === session.number).itemCount })) }, null, 2) + "\n");

console.log(JSON.stringify(built.map(({ number, groupCount, itemCount }) => ({ number, groupCount, itemCount }))));
