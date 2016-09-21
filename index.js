//from https://github.com/howdyai/botkit
if (!process.env.token || !process.env.channel) {
    console.log('Error: Specify token and channel in environment');
    process.exit(1);
}

var Botkit = require('botkit');
var moment = require('moment');
var os = require('os');
var channelId; //own private channel id
var channelInfo; //own private channel info
var teamUsers; //users in all of the slack group
var channelUserNamesAll; //original list of all users in private channel
var channelUserNamesCurrent; //list of users in private channel, possibly with users removed
var channelUserPRCount; //Count of PRs done per user
var prev; //User that was selected previously
var botName;

var controller = Botkit.slackbot({
    debug: false
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM();

//resets users in the morning
function resetUsers() {
  channelUserNamesCurrent = channelUserNamesAll.slice();

  bot.say({
    text: 'All users have been restored!\n' + printCurrent(),
    channel: channelId
  });

  var now = moment();
  var year = now.year();
  var month = now.month();
  var day = now.day();

  var timeToFire = moment().year(year).month(month).day(day).hour(10).minute(0).second(0);

  if (timeToFire < moment(now).add(1, "second")) {
    timeToFire.add(1, "day");
  }

  setTimeout(resetUsers, timeToFire - now);
}

controller.on('rtm_open', function(bot) {
  botName = bot.identity.name;

  //get users list
  bot.api.users.list({}, function(err, res) {
    if (err) {
      bot.botkit.log('Failed to retrieve list of users in team.', err);
      return;
    }
    channelUserPRCount = {};
    teamUsers = res.members;
    teamUsers.forEach(function(teamUser) {
      channelUserPRCount[teamUser.id] = 0;
    });

  });

  //gets channel id
  bot.api.groups.list({}, function(err, res) {
    if (err) {
      bot.botkit.log('Failed to retrieve list of groups.', err);
      return;
    }

    var groups = res.groups;
    groups.forEach(function(group) {
      if (group.name === process.env.channel) {
        channelId = group.id;
      }
    });

    if (!channelId) {
      bot.botkit.log('Could not find channel id for channel ' + process.env.channel);
      return;
    }

    bot.say({
      text: 'Hello! My name is ' + botName + '.',
      channel: channelId
    });

    //gets users in channel
    bot.api.groups.info({
      channel: channelId
    }, function(err, res) {
      if (err) {
          bot.botkit.log('Failed to retrieve group info.', err);
          return;
      }

      channelInfo = res.group;
      var memberIds = channelInfo.members;
      channelUserNamesAll = [];

      memberIds.forEach(function(memberId){
        teamUsers.forEach(function(teamUser) {
          if (teamUser.id === memberId) {
            if (teamUser.profile.real_name.length > 0) {

              channelUserNamesAll.push({
                name: teamUser.profile.real_name,
                username: teamUser.name,
                id: teamUser.id
              });
            }
          }
        });
      });

      //reset users
      resetUsers(bot);

    });
  });

});

// reply to a direct mention - @bot hello
controller.on('direct_mention',function(bot,message) {
  var requestUserId = message.user;
  var requestUserName;
  var requestUserNameString;
  var messageContent = message.text;
  var messageArray = messageContent.split(' ');
  var command;
  var links = [];

  if (messageArray.length >= 1) {
    command = messageArray[0];
    for (var i = 1; i < messageArray.length; i++)
      links.push(messageArray[i]);
  }
  var channelUserNames = channelUserNamesCurrent.slice();

  /* list all possible options */
  if (command && command.toLowerCase() === 'help') {
    bot.reply(message, helpMessage());
  }

  /* restore original users */
  else if (command && command.toLowerCase() === 'reset') {
    channelUserNamesCurrent = channelUserNamesAll.slice();
    bot.reply(message, 'All users have been restored!');
    bot.reply(message, printCurrent());
  }

  /* print all current users */
  else if (command && command.toLowerCase() === 'ls') {
    if (links && links[0] === '-a') {
      bot.reply(message, printAll());
    }
    else {
      bot.reply(message, printCurrent());
    }
  }

  /* pick someone to review code */
  else if (command && links.length > 0 && channelUserNames && command.toLowerCase() === 'review') {

      //remove self
      for (var i = 0; i < channelUserNames.length; i++) {
        if (channelUserNames[i].id === requestUserId) {
          requestUserName = channelUserNames[i].name;
          channelUserNames.splice(i, 1);
          break;
        }
      }

      //determine users that have had the fewest review requests so far
      var low=100,
          high=0,
          user,
          prCount;
      for(var i = 0; i < channelUserNames.length; i++) {
          user = channelUserNames[i];
          prCount = channelUserPRCount[user.id];
          if(prCount < low) {
              low = prCount;
          }
          if(prCount > high) {
              high = prCount;
          }
      }
      if(low != high) {
          for(var i = 0; i < channelUserNames.length; i++) {
              user = channelUserNames[i];
              prCount = channelUserPRCount[user.id];
              if(prCount > low) {
                  //remove from the list
                  channelUserNames.splice(i, 1);
              }
          }
      }

      requestUserNameString = requestUserName ? requestUserName + '\'s' : 'this';

      var randomnumber = Math.floor(Math.random() * (channelUserNames.length));
      var selectedUser = channelUserNames[randomnumber];

      channelUserPRCount[selectedUser.id]++;
      bot.reply(message, 'Hey <@' + selectedUser.username + '> (Review count:'+channelUserPRCount[selectedUser.id]+') please review ' + requestUserNameString + ' code: ' + concatLinks(links));

      // update
      prev = {};
      prev.links = links;
      prev.selectedUser = selectedUser;
      prev.requestUserNameString = requestUserNameString;
      prev.requestUserId = requestUserId;
  }

  /* pick someone else to review code */

  else if (command && channelUserNames && prev && command.toLowerCase() === 'no') {

    // remove previous user from active duty
    remove(prev.selectedUser.id, channelUserNamesCurrent);
    channelUserNames = channelUserNamesCurrent.splice();

    // remove self
    remove(prev.requestUserId, channelUserNames);

    channelUserPRCount[prev.selectedUser.id]--;
    bot.reply(message, 'I messed up. Sorry, ' + prev.selectedUser.name.split(" ")[0] + '! I\'ve temporarily relieved you from code review duties.');

    // select a new user
    var randomnumber = Math.floor(Math.random() * (channelUserNames.length - 1));
    var selectedUser = channelUserNames[randomnumber];

    // links
    channelUserPRCount[selectedUser.id]++;
    bot.reply(message, 'Hey <@' + selectedUser.username + '> (Review count:'+channelUserPRCount[selectedUser.id]+') please review ' + prev.requestUserNameString + ' code: ' + concatLinks(prev.links));

    // update
    prev.selectedUser = selectedUser;

  }

  /* remove an user from active duty */
  else if (command && links.length > 0 && command.toLowerCase() === 'remove') {

    var name = strip(links[0]);
    var user = find(name, channelUserNamesCurrent) || findByUsername(name, channelUserNamesCurrent);

    if (user === 0) {
      bot.reply(message, 'Hmm...I couldn\'t find a human by that name.\nTry `@' + botName + ' ls` to view all active reviewers');
      return;
    }

    // remove
    remove(user.id, channelUserNamesCurrent);
    bot.reply(message, 'Got it! I will not ask ' + user.name.split(" ")[0] + ' to review code.\nYou can re-add any user by saying `@' + botName + ' add @<user>`');
  }

  /* add an user to active duty */
  else if (command && links.length > 0 &&  command.toLowerCase() === 'add') {

    var name = strip(links[0]);
    var user = find(name, channelUserNamesAll) || findByUsername(name, channelUserNamesAll);

    if (user === 0) {
      bot.reply(message, 'Hmm...I couldn\'t find a human by that name.\nTry `@' + botName + ' ls` to view all users in this channel');
      return;
    }

    if (find(name, channelUserNamesCurrent) !== 0 ||
        findByUsername(name, channelUserNamesCurrent) !== 0 ) {
      bot.reply(message, 'Hmm...looks like ' + user.name.split(' ')[0]+ ' is already active.\nYou can say `@' + botName + ' ls` to view all active users');
      return;
    }

    // add
    channelUserNamesCurrent.push(user);
    bot.reply(message, 'Got it! My magic box will now include ' + user.name.split(" ")[0] + ' when it picks someone to review code');
  }


  /** error!
    * - print error msg (with most recently used link, if available)
    * - if user tries to retract with no prev entry, warning + generic error
    * - generic error message
    */

  else if (prev) {
    bot.reply(message, 'Hmm. I didn\'t get that. Try `@' + botName + ' review ' + stripLink(prev.link) + '`');
  }
  else if (command && command.toLowerCase() === 'no') {
    bot.reply(message, 'I didn\'t do anything yet!');
    bot.reply(message, 'Try `@' + botName + ' review <link>`');
  }
  else if (message.text.toLowerCase().indexOf('hi') > -1 ||
           message.text.toLowerCase().indexOf('hello') > -1 ||
           message.text.toLowerCase().indexOf('hey') > -1) {
    var greetings = [
      '\'Sup homeslice?',
      'What do you want? <(ಠ_ಠ)>',
      'Howdy howdy howdy',
      'I like your face.',
      'How do you comfort a JavaScript bug? You console it.'
    ];

    var randomGreeting = greetings[Math.floor(Math.random()*greetings.length)];
    bot.reply(message, randomGreeting);
  }
  else {
    bot.reply(message, 'Try `@' + botName + ' review <link>`');
  }

});

// reply to a direct message
controller.on('direct_message',function(bot,message) {
  if (!message.text) {
    bot.reply(message,'Hmm..I didn\'t catch that');
    return;
  }
  // reply to _message_ by using the _bot_ object
  if (message.text.indexOf('help') > -1 || message.text.indexOf('can you') > -1) {
    bot.reply(message, helpMessage());
  } else if (message.text.indexOf('hi') > -1 || message.text.indexOf('hello') > -1 || message.text.indexOf('hey') > -1) {
    bot.reply(message, 'Howdy! To see a list of everything I can do, say `help`.');
  } else if (message.text.indexOf('all') > -1 && message.text.indexOf('user') > -1) {
    bot.reply(message, printAll());
  } else if (message.text.indexOf('user') > -1 || message.text.indexOf('active user') > -1 || message.text.indexOf('current user') > -1) {
    bot.reply(message, printCurrent());
  } else {
    bot.reply(message, 'Sorry, I didn\'t get that. I\'m a bot, so sometimes I have trouble parsing words!');
    bot.reply(message, 'To see a list of everything I can do, say `help`');
  }
});

// remove from list by id
function remove(s, l) {
  console.log("removing", s, "from", l);
  for (var i = 0; i < l.length; i++) {
    if (l[i].id == s) {
      console.log("found at index", i)
      console.log("deleting", l[i].id)
      l.splice(i, 1);
      break;
    }
  }
}

// find a user by id
function find(s, l) {
  for (var i = 0; i < l.length; i++) {
    if (l[i].id == s) {
      return l[i];
    }
  }
  return 0;
}

// find a user by username
function findByUsername(s, l) {
  for (var i = 0; i < l.length; i++) {
    if (l[i].username == s) {
      return l[i];
    }
  }
  return 0;
}

function strip(s) {
  return s.replace('@', '').replace('<', '').replace('>', '');
}

// strip an actual link
function stripLink(s) {
  return s.replace(/</g, '').replace(/>/g, '').replace(/`/g, '');
}

function concatLinks(l) {
  var o = "";
  for (var i = 0; i < l.length; i++) {
    o += stripLink(l[i]) + " "
  }
  return o;
}

function printCurrent() {
  var o = "Here's a list of all current users:";
  for (var i = 0; i < channelUserNamesCurrent.length; i++) {
    var user = channelUserNamesCurrent[i];
    o += '\n- ' + user.username + ' (Review count:' + channelUserPRCount[user.id] + ')';
  }
  return o;
}

function printAll() {
  var o = "Here's a list of all users in this channel:";
  for (var i = 0; i < channelUserNamesAll.length; i++) {
    var user = channelUserNamesCurrent[i];
    o += '\n- ' + user.username + ' (Review count:' + channelUserPRCount[user.id] + ')';
  }
  return o;
}

function helpMessage() {
  var o  = "Here are all the things I can do:\n";
    o += "_Review code_\t\t`@" + botName + " review <link>`\n";
    o += "_Add an user_\t\t`@" + botName + " add <username>`\n";
    o += "_Remove an user_\t\t`@" + botName + " remove <username>`\n";
    o += "_View all active reviewers_\t\t`@" + botName + " ls`\n";
    o += "_View all users in this channel_\t\t`@" + botName + " ls -a`\n";
    o += "_Set all users to active_\t\t`@" + botName + " reset`";
  return o;
}
