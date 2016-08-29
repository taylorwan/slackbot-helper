//from https://github.com/howdyai/botkit
if (!process.env.token || !process.env.channel) {
    console.log('Error: Specify token and channel in environment');
    process.exit(1);
}

var Botkit = require('botkit');
var os = require('os');
var channelId;
var channelInfo;
var teamUsers;
var channelUserNamesOriginal;
var prev;

var controller = Botkit.slackbot({
    debug: false
});

var bot = controller.spawn({
    token: process.env.token
}).startRTM();

controller.on('rtm_open', function(bot) {
  //get users list

  bot.api.users.list({}, function(err, res) {
    if (err) {
      bot.botkit.log('Failed to retrieve list of users in team.', err);
      return;
    }
    teamUsers = res.members;
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
      channelUserNamesOriginal = [];

      memberIds.forEach(function(memberId){
        teamUsers.forEach(function(teamUser) {
          if (teamUser.id === memberId) {
            if (teamUser.profile.real_name.length > 0) {

              channelUserNamesOriginal.push({
                name: teamUser.profile.real_name,
                username: teamUser.name,
                id: teamUser.id
              });
            }
          }
        });
      });

      // console.log(channelUserNames);
    });
  });



});

// reply to any incoming message
controller.on('message_received', function(bot, message) {
    // bot.reply(message, 'I heard... something!');
    console.log("mesage received: " + JSON.stringify(message));

    // bot.api.groups.list({
    // }, function(err, res) {
    //     if (err) {
    //         bot.botkit.log('Failed to retrieve list of groups', err);
    //     }
    //     // console.log(res);
    //     var groups = res.groups;
    //     channelId;
    //     groups.forEach(function(group) {
    //       if (group.name = process.env.channel) {
    //         channelId = group.id;
    //       }
    //     });
    //   if (!channelId) {
    //     bot.botkit.log('Could not find channel id for channel ' + process.env.channel);
    //     return;
    //   }

    //   bot.api.groups.info({
    //       channel: channelId,
    //   }, function(err, res) {
    //       if (err) {
    //           bot.botkit.log('Failed to retrieve list of groups', err);
    //       }
    //       console.log(res);
    //   });

    // });

});

// reply to a direct mention - @bot hello
controller.on('direct_mention',function(bot,message) {
  // console.log("direct mention");
  // reply to _message_ by using the _bot_ object
  // bot.reply(message,'I heard you mention me!');

  // console.log(JSON.stringify(message));
  var requestUserId = message.user;
  var requestUserName;
  var requestUserNameString;
  var messageContent = message.text;
  var messageArray = messageContent.split(' ');
  var command;
  var link;
  if (messageArray.length >= 1) {
    command = messageArray[0];
    link = messageArray[1];
  }
  var channelUserNames = channelUserNamesOriginal.slice();

  // console.log("content:" + messageContent);
  // console.log("array:" + messageArray);
  // console.log("array length:" + messageArray.length);
  // console.log("command:" + command);
  // console.log("link:" + link);
  // var matchArray = jiraId.match(/PRF-[1-9]\d*$/i);

  // console.log("requestUserId: " + requestUserId);

  if (command && link && command.toLowerCase() === 'review') {
    if (channelUserNames) {

      //remove self
      for (var i = 0; i < channelUserNames.length; i++) {
        if (channelUserNames[i].id === requestUserId) {
          requestUserName = channelUserNames[i].name;
          channelUserNames.splice(i, 1);
          break;
        }
      }

      requestUserNameString = requestUserName ? requestUserName + '\'s' : 'this';

      var min = 0;
      var max = channelUserNames.length - 1;
      var randomnumber = Math.floor(Math.random() * (max - min + 1)) + min;
      var selectedUser = channelUserNames[randomnumber];

      bot.reply(message, 'Hey <@' + selectedUser.username + '> please review ' + requestUserNameString + ' code: ' + link.slice(1, -1));

      // update
      prev = {};
      prev.link = link;
      prev.selectedUser = selectedUser;
      prev.requestUserNameString = requestUserNameString;
      prev.requestUserId = requestUserId;
    }
  }

  /* Choose someone else */

  else if (command && prev && channelUserNames && command.toLowerCase() === 'no') {

    //remove self and previously selected user
    var removedCount = 0;
    for (var i = 0; i < channelUserNames.length; i++) {

      // self
      if (channelUserNames[i].id === prev.requestUserId) {
        requestUserName = channelUserNames[i].name;
        channelUserNames.splice(i, 1);
        removedCount++;
        i--;
      }
      
      // previously selected user
      else if (channelUserNames[i].id === prev.selectedUser.id) {
        channelUserNames.splice(i, 1);
        removedCount++;
        i--;
      }

      // break once both are removed
      if (removedCount === 2) {
        break;
      }
    }

    // select a new user
    var randomnumber = Math.floor(Math.random() * (channelUserNames.length - 1));
    var selectedUser = channelUserNames[randomnumber];

    // bot responses
    bot.reply(message, 'I messed up. Sorry, ' + prev.selectedUser.name.split(" ")[0] + '!');
    bot.reply(message, 'Hey <@' + selectedUser.username + '> please review ' + prev.requestUserNameString + ' code: ' + prev.link.slice(1, -1));

    // put back the previously selected user
    channelUserNames.push(prev.selectedUser);

    // update
    prev.selectedUser = selectedUser;

  }

  /* syntax error! print error msg (with most recently used link, if available) */

  else if (prev) {
    bot.reply(message, 'Hmm. I didn\'t get that. Try `@charmander review ' + prev.link.slice(1, -1) + '`');
  }
  else if (command && command.toLowerCase() === 'no') {
    bot.reply(message, 'I didn\'t do anything yet!');
    bot.reply(message, 'Try `@charmander review https://github.com/FiscalNote/FiscalNote-Service/pull/1171`');
  }
  else {
    bot.reply(message, 'Try `@charmander review https://github.com/FiscalNote/FiscalNote-Service/pull/1171`');
  }

});

// reply to a direct message
controller.on('direct_message',function(bot,message) {
  console.log("direct message:" + JSON.stringify(message));
  // reply to _message_ by using the _bot_ object
  bot.reply(message,'Hi! You are talking directly to me');

});

controller.hears(['hello', 'hi'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'robot_face',
    }, function(err, res) {
        if (err) {
            bot.botkit.log('Failed to add emoji reaction :(', err);
        }
    });


    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Hello ' + user.name + '!!');
        } else {
            bot.reply(message, 'Hello.');
        }
    });
});

controller.hears(['call me (.*)', 'my name is (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var name = message.match[1];
    controller.storage.users.get(message.user, function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }
        user.name = name;
        controller.storage.users.save(user, function(err, id) {
            bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
        });
    });
});

controller.hears(['what is my name', 'who am i'], 'direct_message,direct_mention,mention', function(bot, message) {

    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Your name is ' + user.name);
        } else {
            bot.startConversation(message, function(err, convo) {
                if (!err) {
                    convo.say('I do not know your name yet!');
                    convo.ask('What should I call you?', function(response, convo) {
                        convo.ask('You want me to call you `' + response.text + '`?', [
                            {
                                pattern: 'yes',
                                callback: function(response, convo) {
                                    // since no further messages are queued after this,
                                    // the conversation will end naturally with status == 'completed'
                                    convo.next();
                                }
                            },
                            {
                                pattern: 'no',
                                callback: function(response, convo) {
                                    // stop the conversation. this will cause it to end with status == 'stopped'
                                    convo.stop();
                                }
                            },
                            {
                                default: true,
                                callback: function(response, convo) {
                                    convo.repeat();
                                    convo.next();
                                }
                            }
                        ]);

                        convo.next();

                    }, {'key': 'nickname'}); // store the results in a field called nickname

                    convo.on('end', function(convo) {
                        if (convo.status == 'completed') {
                            bot.reply(message, 'OK! I will update my dossier...');

                            controller.storage.users.get(message.user, function(err, user) {
                                if (!user) {
                                    user = {
                                        id: message.user,
                                    };
                                }
                                user.name = convo.extractResponse('nickname');
                                controller.storage.users.save(user, function(err, id) {
                                    bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
                                });
                            });



                        } else {
                            // this happens if the conversation ended prematurely for some reason
                            bot.reply(message, 'OK, nevermind!');
                        }
                    });
                }
            });
        }
    });
});


controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.startConversation(message, function(err, convo) {

        convo.ask('Are you sure you want me to shutdown?', [
            {
                pattern: bot.utterances.yes,
                callback: function(response, convo) {
                    convo.say('Bye!');
                    convo.next();
                    setTimeout(function() {
                        process.exit();
                    }, 3000);
                }
            },
        {
            pattern: bot.utterances.no,
            default: true,
            callback: function(response, convo) {
                convo.say('*Phew!*');
                convo.next();
            }
        }
        ]);
    });
});


controller.hears(['uptime', 'identify yourself', 'who are you', 'what is your name'],
    'direct_message,direct_mention,mention', function(bot, message) {

        var hostname = os.hostname();
        var uptime = formatUptime(process.uptime());

        bot.reply(message,
            ':robot_face: I am a bot named <@' + bot.identity.name +
             '>. I have been running for ' + uptime + ' on ' + hostname + '.');

    });

function formatUptime(uptime) {
    var unit = 'second';
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'minute';
    }
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'hour';
    }
    if (uptime != 1) {
        unit = unit + 's';
    }

    uptime = uptime + ' ' + unit;
    return uptime;
}
