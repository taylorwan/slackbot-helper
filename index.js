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
var channelUserNamesAll;
var channelUserNamesCurrent;
var channelUserPRCount;
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

      channelUserNamesCurrent = channelUserNamesAll.slice();

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
  var links = [];
  if (messageArray.length >= 1) {
    command = messageArray[0];
    for (var i = 1; i < messageArray.length; i++)
      links.push(messageArray[i]);
  }
  var channelUserNames = channelUserNamesCurrent.slice();

  // console.log("content:" + messageContent);
  // console.log("array:" + messageArray);
  // console.log("array length:" + messageArray.length);
  // console.log("command:" + command);
  // console.log("links:" + links);
  // var matchArray = jiraId.match(/PRF-[1-9]\d*$/i);

  // console.log("requestUserId: " + requestUserId);


  /* list all possible options */

  if (command && command.toLowerCase() === 'help') {
    var o  = "Here are all the things I can do:\n";
        o += "_Review code_\t\t`@charmander review <link>`\n";
        o += "_Add an user_\t\t`@charmander add @<user>`\n";
        o += "_Remove an user_\t\t`@charmander remove @<user>`\n";
        o += "_Retract last assignment_\t\t`@charmander no`\n";
        o += "_View all active reviewers_\t\t`@charmander ls`\n";
        o += "_View all users in this channel_\t\t`@charmander ls -a`\n";
        o += "_Set all users to active_\t\t`@charmander reset`";
    bot.reply(message, o);
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

      bot.reply(message, 'Hey <@' + selectedUser.username + '('+channelUserPRCount[selectedUser.id]+')> please review ' + requestUserNameString + ' code: ' + concatLinks(links));
      channelUserPRCount[selectedUser.id]++;

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

    bot.reply(message, 'I messed up. Sorry, ' + prev.selectedUser.name.split(" ")[0] + '! I\'ve temporarily relieved you from code review duties.');

    // select a new user
    var randomnumber = Math.floor(Math.random() * (channelUserNames.length - 1));
    var selectedUser = channelUserNames[randomnumber];

    // links

    bot.reply(message, 'Hey <@' + selectedUser.username + '> please review ' + prev.requestUserNameString + ' code: ' + concatLinks(prev.links));

    // update
    prev.selectedUser = selectedUser;

  }

  /* remove an user from active duty */

  else if (command && links.length > 0 && command.toLowerCase() === 'remove') {

    var name = strip(links[0]);
    var user = find(name, channelUserNamesCurrent) || findByUsername(name, channelUserNamesCurrent);

    if (user === 0) {
      bot.reply(message, 'Hmm...I couldn\'t find a human by that name.\nTry `@charmander ls` to view all active reviewers');
      return;
    }

    // remove
    remove(user.id, channelUserNamesCurrent);
    bot.reply(message, 'Got it! I will not ask ' + user.name.split(" ")[0] + ' to review code.\nYou can re-add any user by saying `@charmander add @<user>`');
  }

  /* add an user to active duty */

  else if (command && links.length > 0 &&  command.toLowerCase() === 'add') {
    
    var name = strip(links[0]);
    var user = find(name, channelUserNamesAll) || findByUsername(name, channelUserNamesAll);

    if (user === 0) {
      bot.reply(message, 'Hmm...I couldn\'t find a human by that name.\nTry `@charmander ls` to view all users in this channel');
      return;
    }

    if (find(name, channelUserNamesCurrent) !== 0 ||
        findByUsername(name, channelUserNamesCurrent) !== 0 ) {
      bot.reply(message, 'Hmm...looks like ' + user.name.split(' ')[0]+ ' is already active.\nYou can say `@charmander ls` to view all active users');
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
    bot.reply(message, 'Hmm. I didn\'t get that. Try `@charmander review ' + stripLink(prev.link) + '`');
  }
  else if (command && command.toLowerCase() === 'no') {
    bot.reply(message, 'I didn\'t do anything yet!');
    bot.reply(message, 'Try `@charmander review <link>`');
  }
  else {
    bot.reply(message, 'Try `@charmander review <link>`');
  }

});

// reply to a direct message
controller.on('direct_message',function(bot,message) {
  console.log("direct message:" + JSON.stringify(message));
  // reply to _message_ by using the _bot_ object
  bot.reply(message,'Hi! You are talking directly to me');

});

// controller.hears(['hello', 'hi'], 'direct_message,direct_mention,mention', function(bot, message) {

//     bot.api.reactions.add({
//         timestamp: message.ts,
//         channel: message.channel,
//         name: 'robot_face',
//     }, function(err, res) {
//         if (err) {
//             bot.botkit.log('Failed to add emoji reaction :(', err);
//         }
//     });


//     controller.storage.users.get(message.user, function(err, user) {
//         if (user && user.name) {
//             bot.reply(message, 'Hello ' + user.name + '!!');
//         } else {
//             bot.reply(message, 'Hello.');
//         }
//     });
// });

// controller.hears(['call me (.*)', 'my name is (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
//     var name = message.match[1];
//     controller.storage.users.get(message.user, function(err, user) {
//         if (!user) {
//             user = {
//                 id: message.user,
//             };
//         }
//         user.name = name;
//         controller.storage.users.save(user, function(err, id) {
//             bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
//         });
//     });
// });

// controller.hears(['what is my name', 'who am i'], 'direct_message,direct_mention,mention', function(bot, message) {

//     controller.storage.users.get(message.user, function(err, user) {
//         if (user && user.name) {
//             bot.reply(message, 'Your name is ' + user.name);
//         } else {
//             bot.startConversation(message, function(err, convo) {
//                 if (!err) {
//                     convo.say('I do not know your name yet!');
//                     convo.ask('What should I call you?', function(response, convo) {
//                         convo.ask('You want me to call you `' + response.text + '`?', [
//                             {
//                                 pattern: 'yes',
//                                 callback: function(response, convo) {
//                                     // since no further messages are queued after this,
//                                     // the conversation will end naturally with status == 'completed'
//                                     convo.next();
//                                 }
//                             },
//                             {
//                                 pattern: 'no',
//                                 callback: function(response, convo) {
//                                     // stop the conversation. this will cause it to end with status == 'stopped'
//                                     convo.stop();
//                                 }
//                             },
//                             {
//                                 default: true,
//                                 callback: function(response, convo) {
//                                     convo.repeat();
//                                     convo.next();
//                                 }
//                             }
//                         ]);

//                         convo.next();

//                     }, {'key': 'nickname'}); // store the results in a field called nickname

//                     convo.on('end', function(convo) {
//                         if (convo.status == 'completed') {
//                             bot.reply(message, 'OK! I will update my dossier...');

//                             controller.storage.users.get(message.user, function(err, user) {
//                                 if (!user) {
//                                     user = {
//                                         id: message.user,
//                                     };
//                                 }
//                                 user.name = convo.extractResponse('nickname');
//                                 controller.storage.users.save(user, function(err, id) {
//                                     bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
//                                 });
//                             });



//                         } else {
//                             // this happens if the conversation ended prematurely for some reason
//                             bot.reply(message, 'OK, nevermind!');
//                         }
//                     });
//                 }
//             });
//         }
//     });
// });


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


// controller.hears(['uptime', 'identify yourself', 'who are you', 'what is your name'],
//     'direct_message,direct_mention,mention', function(bot, message) {

//         var hostname = os.hostname();
//         var uptime = formatUptime(process.uptime());

//         bot.reply(message,
//             ':robot_face: I am a bot named <@' + bot.identity.name +
//              '>. I have been running for ' + uptime + ' on ' + hostname + '.');

//     });

// function formatUptime(uptime) {
//     var unit = 'second';
//     if (uptime > 60) {
//         uptime = uptime / 60;
//         unit = 'minute';
//     }
//     if (uptime > 60) {
//         uptime = uptime / 60;
//         unit = 'hour';
//     }
//     if (uptime != 1) {
//         unit = unit + 's';
//     }

//     uptime = uptime + ' ' + unit;
//     return uptime;
// }

// remove from list by id
function remove(s, l) {
  for (var i = 0; i < l.length; i++) {
    if (l[i].id == s) {
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
  return s.replace('<', '').replace('>', '').replace('`', '');
}

function printCurrent() {
  var o = "Here's a list of all current users:";
  for (var i = 0; i < channelUserNamesCurrent.length; i++) {
    o += '\n- ' + channelUserNamesCurrent[i].username;
  }
  return o;
}

function printAll() {
  var o = "Here's a list of all users in this channel:";
  for (var i = 0; i < channelUserNamesAll.length; i++) {
    o += '\n- ' + channelUserNamesAll[i].username;
  }
  return o;
}

function concatLinks(l) {
  var o = "";
  for (var i = 0; i < l.length; i++) {
    o += stripLink(l[i]) + " "
  }
  return o;
}
