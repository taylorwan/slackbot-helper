//from https://github.com/howdyai/botkit
if (!process.env.token || !process.env.channel) {
    console.log('Error: Specify token and channel in environment');
    process.exit(1);
}

var Botkit = require('botkit'),
    moment = require('moment'),
    os     = require('os'),

    channelId, //own private channel id
    channelInfo, //own private channel info
    teamUsers, //users in all of the slack group
    channelUserNamesAll, //original list of all users in private channel
    channelUserNamesCurrent, //list of users in private channel, possibly with users removed
    prev, //User that was selected previously
    botName,
    requestRestart,
    bannedUsers = ['Vincent Eberle', 'May Zhai'];

var controller = Botkit.slackbot({
  debug: false
});

var bot = controller.spawn({
  token: process.env.token
}).startRTM();


/**
 * RESET FUNCTIONALITY
 * - resetController: determine which reset to call
 * - dailyReset: retore all users
 * - weeklyReset: restore all users & reset PR counts
 * - boot
 */

/* start */
controller.on('rtm_open', function() {
  boot(bot);
});

function resetController(bot) {
  // get moment object for 9am tomorrow
  var now        = moment(),
      timeToFire = moment().add(1, 'days').hour(13).minute(0).second(0);

  // perform appropriate reset for today
  if (now.weekday() === 1)
    say(weeklyReset(), bot); // weekly reset on Mondays
  else
    say(dailyReset(), bot); // daily reset for all other weekdays

  // if timeToFire is weekend, add 2 days (=> Monday)
  if (timeToFire.weekday() > 5)
    timeToFire.add(2, 'days');

  // run this again "timeToFire"
  setTimeout(function() {
    resetController(bot)
  }, timeToFire - now);
}

/* daily functions */
function dailyReset() {
  return 'Good Morning!';
}

/* weekly functions */
function weeklyReset() {
  resetPRCount();
  return 'Happy Monday! All PR counts have been reset\n' + printCurrent();
}

/* boot up */
function boot(bot) {
  botName        = bot.identity.name;
  requestRestart = false;

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

    // gets users in channel
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
            if (teamUser.profile.real_name.length > 0 && bannedUsers.indexOf(teamUser.profile.real_name) <= -1) {
              channelUserNamesAll.push({
                name: teamUser.profile.real_name,
                username: teamUser.name.toLowerCase(),
                id: teamUser.id.toLowerCase(),
                prCount: 0
              });
            }
          }
        });
      });

      // create a copy for current channel users
      restoreUsers();

      // welcome!
      say('Hello! My name is ' + botName + ' :charmander::sunny:', bot);

      // activate resets
      // resetController(bot);
    });
  });
}


/**
 * DIRECT MENTION FUNCTIONALITY
 * - help
 * - restart
 * - reset pr
 * - reset
 * - ls -a
 * - ls
 * - increment / decrement
 * - review
 * - no
 * - remove
 * - add
 * - greetings (hi, hello, hey)
 */

// reply to a direct mention - @bot hello
controller.on('direct_mention',function(bot, message) {
  var requestUserId = message.user.toLowerCase();
  var requestUserName;
  var requestUserNameString;
  var messageContent = message.text.toLowerCase();
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
  if (command && command === 'help') {
    bot.reply(message, helpMessage());
  }

  /* restart */
  else if (command && command === 'restart') {
    requestRestart = true;
    bot.reply(message, 'Are you sure you\'d like to restart? '
      + 'All user data will be reset (@' + botName + ' yes/no)');
  }

  /* verify restart: yes */
  else if (command && command === 'yes' && requestRestart) {
    requestRestart = false;
    bot.reply(message, 'Restarting...see ya in a sec!');

    // 1 second timeout to make it seem like the bot is taking a second to restart
    setTimeout( function() {
      boot(bot);
    }, 1000);
  }

  /* verify restart: no */
  else if (command && command === 'no' && requestRestart) {
    requestRestart = false;
    bot.reply(message, 'Okay, I will not restart');
  }

  /* restore pr counts */
  else if (command && contains(messageContent, ['reset pr', 'pr reset'])) {
    bot.reply(message, resetPRCount());
  }

  /* restore original users */
  else if (command && command === 'reset') {
    bot.reply(message, restoreUsers());
  }

  /* print all users */
  else if (command && contains(messageContent, ['ls -a', 'ls all', 'list -a', 'list all'])) {
    bot.reply(message, printAll());
  }

  /* print all current users */
  else if (command && command === 'ls' || command === 'list') {
    bot.reply(message, printCurrent());
  }

  /* increment/decrement PR count for an user */
  else if (command && contains(command, ['++', '--'])) {
    bot.reply(message, updatePRCount(command)); //updatePRCount returns any success/error messages
  }

  /* pick someone to review code */
  else if (command && links.length > 0 && command === 'review') {
    // remove self
    removeUser(requestUserId, channelUserNames);

    // no other reviewers
    if (!channelUserNames.length) {
      bot.reply(message, noReviewersError());
      return;
    }

    //determine users that have had the fewest review requests so far
    var low = 100,
      high = 0,
      user,
      prCount;
    for (var i in channelUserNames) {
      user = channelUserNames[i];
      prCount = user.prCount;
      if (prCount < low) {
          low = prCount;
      }
      if (prCount > high) {
          high = prCount;
      }
    }
    if (low != high) {
      for (var i in channelUserNames) {
        user = channelUserNames[i];
        prCount = user.prCount;
        if (prCount > low) {
          // remove from the list
          channelUserNames.splice(i, 1);
        }
      }
    }

    requestUserNameString = requestUserName ? requestUserName + '\'s' : 'this';

    var randomnumber = Math.floor(Math.random() * (channelUserNames.length));
    var selectedUser = channelUserNames[randomnumber];

    selectedUser.prCount++;
    bot.reply(message, 'Hey <@' + selectedUser.username + '> (Review count: '
      + selectedUser.prCount + ') please review ' + requestUserNameString
      + ' code: ' + concatLinks(links));

    // update
    prev = {};
    prev.links = links;
    prev.selectedUser = selectedUser;
    prev.requestUserNameString = requestUserNameString;
    prev.requestUserId = requestUserId;
  }

  /* pick someone else to review code */

  else if (command && channelUserNames && prev && command === 'no') {

    // remove self
    removeUser(prev.requestUserId, channelUserNames);

    // decrease previous user prCount and relieve them of reviewing duty
    prev.selectedUser.prCount--;
    bot.reply(message, 'I messed up. Sorry, ' + getUsername(prev.selectedUser) + '! :see_no_evil:');

    // no other reviewers
    if (!channelUserNames.length) {
      bot.reply(message, noReviewersError());
      return;
    }

    // other reviewers exist
    // select a new user
    var randomnumber = Math.floor(Math.random() * (channelUserNames.length));
    var selectedUser = channelUserNames[randomnumber];
    selectedUser.prCount++;
    bot.reply(message, 'Hey <@' + selectedUser.username + '> (Review count: '
      + selectedUser.prCount + ') please review ' + prev.requestUserNameString
      + ' code: ' + concatLinks(prev.links));

    // update prev
    prev.selectedUser = selectedUser;
  }

  /* remove an user from active duty */
  else if (command && links.length > 0 && command === 'remove') {

    var name       = stripUser(links[0]);
        user       = find(name, channelUserNamesCurrent);

    // add back after a period of time
    if (user && links[1] === 'for') {

      // validate and parse args
      var input      = messageArray.slice(3).join(' ').match(/[a-zA-Z]+|[0-9]+/g);
          parsedTime = validateTime(input);

      // invalid args
      if (!(typeof parsedTime === 'object')) {
        bot.reply(message, invalidTimeArgsError());
        return;
      }

      // parse interval
      var interval             = getRelativeInterval(parsedTime),
          dateKeysCount        = Object.keys(parsedTime).length,
          theNextTimeInEnglish = '',
          timeInEnglish        = ''
          count                = 0;

      // build semantic string representation of input
      for (var unit in parsedTime) {
        var val = parsedTime[unit];

        // if value is 0, decrement total count
        if (val === 0) {
          dateKeysCount--;
          continue;
        }

        /* multiple arguments */
        // if there's already something in the string, add space before
        if (timeInEnglish.length > 0) {
          timeInEnglish        += ' ';
          theNextTimeInEnglish += ' ';

          // if this is the last element we're adding, add keyword 'and'
          if (count === dateKeysCount-1) {
            timeInEnglish        += 'and '
            theNextTimeInEnglish += 'and ';
          }
        }

        // add to string:
        // if plural (i.e. 2 seconds)
        if (val > 1) {
          theNextTimeInEnglish += val + ' ' + unit + 's';
          timeInEnglish        += val + ' ' + unit + 's';
        }

        // first item in the list is singular
        else if (count === 0) {
          theNextTimeInEnglish += unit;
          if (unit === 'hour')
            timeInEnglish += 'an ' + unit;
          else
            timeInEnglish += 'a ' + unit;
        }

        // all other singular cases:
        // singular (i.e. an hour)
        else if (unit === 'hour') {
          theNextTimeInEnglish += 'an ' + unit;
          timeInEnglish        += 'an ' + unit;
        }
        // singular (i.e. a second)
        else {
          theNextTimeInEnglish += 'a ' + unit;
          timeInEnglish        += 'a ' + unit;
        }

        // increment count
        count++;
      }

      // remove
      removeUser(user.id, channelUserNamesCurrent);
      bot.reply(message, 'I\'ve removed ' + getUsername(user)
        + ' from active duty for the next ' + theNextTimeInEnglish
        + '! I\'ll let the team know when they return.');

      // set add back timeout
      setTimeout(function() {
        if (!find(user.id, channelUserNamesCurrent)) {
          addUser(user, channelUserNamesCurrent);
          say('It\'s been ' + timeInEnglish + '! ' + getUsername(user)
            + " is now back in the mix :clapping:", bot);
        }
      }, interval);
      return;
    }

    else if (user && links[1] === 'til' || links[1] === 'until') {
      var input       = messageArray.slice(3).join(' ').match(/[a-zA-Z]+|[0-9]+/g),
          inputString = input.join(' '),
          time        = moment().hour(13).minute(0).second(0); // default morning
          // parsedDate  = parseDate(input);

      console.log(input);

      // get date
      if (contains(inputString, 'tomorrow')) {
        time = time.add(1, 'day');
      }
      // else if day of week
      // else if date

      // get time
      if (contains(inputString, 'afternoon')) {
        time = time.hour(17); // 1pm
      }

      // remove
      removeUser(user.id, channelUserNamesCurrent);
      bot.reply(message, 'I\'ve removed ' + getUsername(user)
        + ' from active duty until ' + inputString
        + '! I\'ll let the team know when they return.');

      // set add back timeout
      setTimeout(function() {
        if (!find(user.id, channelUserNamesCurrent)) {
          addUser(user, channelUserNamesCurrent);
          say(getUsername(user) + " is now back in the mix :clapping:", bot);
        }
      }, time - moment());
      return;
    }

    // remove
    else if (user) {
      removeUser(user.id, channelUserNamesCurrent);
      bot.reply(message, 'Got it! I will not ask ' + getUsername(user)
        + ' to review code.\nYou can re-add any user by saying `@'
        + botName + ' add @<user>`');
      return;
    }

    // already inactive
    user = find(name, channelUserNamesAll);
    if (user) {
      bot.reply(message, userNotActiveError(user, 'Did you mean to remove a different user?'));
      return;
    }

    // user not found
    bot.reply(message, userNotFoundError());
  }

  /* add an user to active duty */
  else if (command && links.length > 0 && command === 'add') {

    var name = stripUser(links[0]);
    var user = find(name, channelUserNamesAll);

    // user not found
    if (user === 0) {
      bot.reply(message, userNotFoundError());
      return;
    }

    // user already active
    if (find(name, channelUserNamesCurrent)) {
      bot.reply(message, userActiveError(user, 'You can say `@' + botName
        + ' ls` to view all active users'));
      return;
    }

    // add
    addUser(user, channelUserNamesCurrent);
    bot.reply(message, 'Got it! My magic box will now include ' + getUsername(user)
      + ' when it picks someone to review code');
  }

  /* greetings */
  else if (command && contains(messageContent, ['hi', 'hello', 'hey'])) {
    var greetings = [
      '\'Sup homeslice?',
      'What do you want? <(ಠ_ಠ)>',
      'Howdy howdy howdy',
      'I like your face.',
      'How do you comfort a JavaScript bug? You console it.'
    ];

    var randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    bot.reply(message, randomGreeting);
  }

  /** error!
    * - print error msg (with most recently used link, if available)
    * - if user tries to retract with no prev entry, warning + generic error
    * - generic error message
    */

  else if (command && !prev && command === 'no') {
    bot.reply(message, 'I didn\'t do anything yet!');
    bot.reply(message, 'Try `@' + botName + ' review <link>`');
  }
  else if (contains(messageContent, ['thanks', 'thank', 'thank you', 'yay', 'woo'])) {
    bot.reply(message, ':smile: :tada:');
  }
  else if (contains(messageContent, ['stop', 'devolve', 'shut up', 'shush', 'ugh',
    'be quiet', 'drop', 'kill', 'no', 'stupid', 'dumb', 'quit', 'bad'])) {
    bot.reply(message, ':white_frowning_face: I\'m trying my best!');
  }
  else {
    bot.reply(message, IDontUnderstand());
  }

  return;
});


/**
 * DIRECT MESSAGE FUNCTIONALITY
 * - help
 * - greetings (hi, hello, hey)
 * - list users (all users, active/current users)
 */

// reply to a direct message
controller.on('direct_message',function(bot,message) {
  messageContent = message.text;
  if (!messageContent) {
    bot.reply(message,'Hmm..I didn\'t catch that');
    return;
  }
  // reply to _message_ by using the _bot_ object
  if (contains(messageContent, ['help', 'can you'])) {
    bot.reply(message, helpMessage());
  } else if (contains(messageContent, ['hi', 'hello', 'hey'])) {
    bot.reply(message, 'Howdy! To see a list of everything I can do, say `help`.');
  } else if (contains(messageContent, ['all', 'user'])) {
    bot.reply(message, printAll());
  } else if (contains(messageContent, ['user', 'active user', 'current user'])) {
    bot.reply(message, printCurrent());
  } else if (contains(messageContent, ['thanks', 'thank', 'thank you', 'yay', 'woo'])) {
    bot.reply(message, 'You\'re welcome! :smile:');
  } else {
    bot.reply(message, IDontUnderstand());
  }
});


/**
 * USER HELPERS
 * - addUser
 * - removeUser
 * - restoreUsers
 * - getUsername
 * - find (findById, findByUsername)
 * - incrementCount
 * - decrementCount
 * - updatePRCount
 * - resetPRCount
 */

/* add user to list */
function addUser(s, l) {
  l.push(s);
}

/* remove from list by id */
function removeUser(s, l) {
  for (var i in l) {
    if (l[i].id == s) {
      l.splice(i, 1);
      break;
    }
  }
}

/* restore all users to active */
function restoreUsers() {
  channelUserNamesCurrent = channelUserNamesAll.slice();
  return 'All users have been restored!\n' + printCurrent();
}

/* get a user's username */
function getUsername(user) {
  return user.name.split(' ')[0];
}

/* find a user */
function find(s, l) {
  return findById(s, l) || findByUsername(s, l);
}

/* find a user by id */
function findById(s, l) {
  for (var i in l) {
    if (l[i].id == s) {
      return l[i];
    }
  }
  return 0;
}

/* find a user by username */
function findByUsername(s, l) {
  for (var i in l) {
    if (l[i].username == s) {
      return l[i];
    }
  }
  return 0;
}

/* increases a user's PR count */
function incrementCount(user) {
  user.prCount++;
}

/* decreases a user's PR count */
function decrementCount(user) {
  if (user.prCount > 0) {
    user.prCount--;
    return true;
  }
  return false;
}

/* increment/decrement a user's PR count */
function updatePRCount(command) {
  // determine if we're incrementing or decrementing
  var operator;
  if (contains(command, ['++']))
    operator = '++';
  else if (contains(command, ['--']))
    operator = '--';
  else {
    return 'Hmm, something went wrong'
  }

  // find user
  var name            = stripUser(command.replace(operator, '')),
      user            = find(name, channelUserNamesCurrent),
      userToIncrement = find(name, channelUserNamesAll);

  // user is active, increment/decrement
  if (user && userToIncrement) {
    if (operator == '++')
      incrementCount(userToIncrement);
    else
      if (!decrementCount(userToIncrement))
        return getUsername(user) + ' already has a PR count of ' + user.prCount + '!';
    return 'Success! ' + getUsername(user) + ' now has a PR count of ' + user.prCount;
  }

  // user is not active
  if (userToIncrement)
      return userNotActiveError(userToIncrement, 'You can only ' + operator + ' the PR count of active users');

  // error: no user found
  return userNotFoundError();
}

/* reset the PR count for all users */
function resetPRCount() {
  channelUserNamesAll.map(function(user) {
    return user.prCount = 0;
  })
  return 'All PR counts have been reset!\n' + printCurrent();
}


/**
 * GENERAL HELPERS
 * - stripUser, stripLink
 * - concatLinks
 * - contains
 */

/* strip an user id */
function stripUser(s) {
  return s.replace('@', '').replace('<', '').replace('>', '');
}

/* strip a link */
function stripLink(s) {
  return s.replace(/</g, '').replace(/>/g, '').replace(/`/g, '');
}

/* concatenate a message */
function concatLinks(l) {
  var o = "";
  for (var i in l) {
    o += stripLink(l[i]) + " "
  }
  return o;
}

/* check if a string contains any of the elements in an array */
function contains(s, l) {
  for (i in l) {
    if (s.indexOf(l[i]) > -1) {
      return true;
    }
  }
  return false;
}

/* validates interval params and returns an object with parsed values */
function validateTime(input) {
  var d = 0,
      h = 0,
      m = 0,
      s = 0;

  for (var i = 0; i < input.length; i+=2) {
    var val = input[i].match(/\d+/);

    // val is not a number
    if (!val)
      return invalidTimeArgsError();

    // convert val from string to int
    val = parseInt(val);

    // if param is valid, set 
    if (isWeek(input[i+1]))
      d += 7*val;
    else if (isDay(input[i+1]))
      d += val;
    else if (isHour(input[i+1]))
      h += val;
    else if (isMinute(input[i+1]))
      m += val;
    else if (isSecond(input[i+1]))
      s += val;
    else if (isYear(input[i+1]) || isMonth(input[i+1]))
      return outOfBoundsTimeArgsError();
    else
      return invalidTimeArgsError();
  }

  // success
  return {day: d, hour: h, minute: m, second: s};
}

/* validates a date and returns an object with parsed values */
// function validateDate(input) {
//   var d = 0,
//       h = 0,
//       m = 0,
//       s = 0;

//   for (var i = 0; i < input.length; i+=2) {
//     var val = input[i].match(/\d+/);

//     // val is not a number
//     if (!val)
//       return invalidDateArgsError();

//     // convert val from string to int
//     val = parseInt(val);

//     // if param is valid, set
//     if (isWeek(input[i+1]))
//       d += 7*val;
//     else if (isDay(input[i+1]))
//       d += val;
//     else if (isHour(input[i+1]))
//       h += val;
//     else if (isMinute(input[i+1]))
//       m += val;
//     else if (isSecond(input[i+1]))
//       s += val;
//     else if (isYear(input[i+1]) || isMonth(input[i+1]))
//       return outOfBoundsTimeArgsError();
//     else
//       return invalidTimeArgsError();
//   }

//   // success
//   return {day: d, hour: h, minute: m, second: s};
// }

/* string matches keyword for week */
function isYear(s) {
  return s === 'years' || s === 'year' || s === 'yr' || s === 'yrs' || s === 'y';
}

/* string matches keyword for week */
function isMonth(s) {
  return s === 'months' || s === 'month' || s === 'mon' || s === 'mons';
}

/* string matches keyword for week */
function isWeek(s) {
  return s === 'weeks' || s === 'week' || s === 'w';
}

/* string matches keyword for day */
function isDay(s) {
  return s === 'days' || s === 'day' || s === 'd';
}

/* string matches keyword for hour */
function isHour(s) {
  return s === 'hours' || s === 'hour' || s === 'hrs' || s === 'hr' || s === 'h';
}

/* string matches keyword for minute */
function isMinute(s) {
  return s === 'minutes' || s === 'minute' || s === 'mins' || s === 'min' || s === 'm';
}

/* string matches keyword for second */
function isSecond(s) {
  return s === 'seconds' || s === 'second' || s === 'secs' || s === 'sec' || s === 's';
}

/* determine relative interval */
function getRelativeInterval(t) {
  var now = moment(),
      interval = moment().add(t.day, 'day').add(t.hour, 'hour').add(t.minute, 'minute').add(t.second, 'second');
  return interval - now;
}

/* determine absolute interval */
// function getDateInterval(t) {
//   var now      = moment(),
//       year     = t.year   || moment().year(),
//       month    = t.month  || moment().month(),
//       day      = t.day    || moment().day(),
//       hour     = t.hour   || moment().hour(),
//       minute   = t.minute || moment().minute(),
//       second   = t.second || moment().second(),
//       interval = moment().year(t.year).month(t.month).day(t.day).hour(t.hour).minute(t.minute).second(t.second);

//   console.log(year);
//   console.log(month);
//   console.log(day);
//   console.log(hour);
//   console.log(minute);
//   console.log(second);
//   console.log(interval);

//   return interval - now;
// }


/**
 * GENERAL MESSAGING
 * - printCurrent
 * - printAll
 * - IDontUnderstand
 * - helpMessage
 * - say
 */

/* return a string of all active users */
function printCurrent() {
  var o = "Here's a list of all active users:";
  for (var i in channelUserNamesCurrent) {
    var user = channelUserNamesCurrent[i];
    o += '\n- ' + user.username + ' (Review count: ' + user.prCount + ')';
  }
  return o;
}

/* return a string of all users */
function printAll() {
  var o = "Here's a list of all users in this channel:";
  for (var i in channelUserNamesAll) {
    var user = channelUserNamesAll[i];
    o += '\n- ' + user.username + ' (Review count: ' + user.prCount + ')';
  }
  return o;
}

/* return a string saying I don't understand */
function IDontUnderstand() {
  return 'Sorry, I didn\'t get that. I\'m a bot, so sometimes ' +
         'I have trouble parsing words! :see_no_evil:\n' +
         'To see a list of everything I can do, say `help`';
}

/* return a string with all bot capabilities */
function helpMessage() {
  return "Here are all the things I can do:\n" +
         "\n*Code Review*\n" +
         "_Pick someone to review code_\t`@" + botName + " review <link>`\n" +
         "\n*Manage Users*\n" +
         "_Add an user_\t\t\t\t\t\t\t   `@" + botName + " add <username>`\n" +
         "_Remove an user_\t\t\t\t\t\t `@" + botName + " remove <username>`\n" +
         "_\tfor a timed interval_\t\t\t\t `... for [<#> week/day/hour/minute(s)]*`\n" +
         "_\tuntil_\t\t\t\t\t\t\t\t\t\t`... until [tomorrow] [mm/dd] (morning/afternoon)(optional)`\n" +
         "\n*PR Counts*\n" +
         "_Increase an user's PR count_\t   `@" + botName + " <username>++`\n" +
         "_Decrease an user's PR count_\t `@" + botName + " <username>--`\n" +
         "_Reset all PR counts_\t\t\t\t\t`@" + botName + " reset pr`\n" +
         "\n*Print Current Status*\n" +
         "_View all active reviewers_\t\t\t`@" + botName + " ls`\n" +
         "_View all users in this channel_\t `@" + botName + " ls -a`\n" +
         "\n*Reset*\n" +
         "_Set all users to active_\t\t\t\t`@" + botName + " reset`\n" +
         "_Restart_\t\t\t\t\t\t\t\t\t   `@" + botName + " restart`\n" +
         "\nI restore all users every weekday morning at 9am, and " +
         "reset PR counts to 0 every Monday at 9am";
}

/* wrapper for slack's bot.say */
function say(msg, bot) {
  // if there's no message, return
  if (!msg)
    return;

  bot.say({
    text: msg,
    channel: channelId
  })
}


/**
 * ERROR MESSAGING
 * - userNotFoundError
 * - userNotActiveError
 * - userActiveError
 */

function userNotFoundError() {
  return 'Hmm...I couldn\'t find a human by that name.\nTry `@' + botName +
         ' ls` to view all users in this channel'
}

function userNotActiveError(user, message) {
  var err = 'Hmm...looks like ' + getUsername(user) + ' is not active.';
  if (message)
    err += '\n' + message;
  return err;
}

function userActiveError(user, message) {
  var err = 'Hmm...looks like ' + getUsername(user) + ' is already active.';
  if (message)
    err += '\n' + message;
  return err;
}

function noReviewersError() {
  prev = null;
  return 'There are no active users who can review your code! :vince::confounded:\n' +
         'You can view all users in this channel by saying `@' + botName + ' ls -a` ' +
         'and add any user by saying `@' + botName + ' add @<user>`';
}

function invalidTimeArgsError() {
  return 'Hmm, I didn\'t get that. Please make sure the time is in the format ' +
         '[# days] [# hours] [# minutes]';
}

function invalidDateArgsError() {
  return 'Hmm, I didn\'t get that. I can understand dates in the following formats:\n' +
         '- tomorrow _[morning/afternoon] (optional)_';
         // '- tomorrow/day of week (Monday/Tuesday/etc.) _[morning/afternoon] (optional)_' +
         // '- dd/mm or dd/mm/yyyy _[morning/afternoon] (optional)_';
}

function outOfBoundsTimeArgsError() {
  return 'Do you really want to remove someone for that long? Try entering a time ' +
         'in terms of weeks, days, hours, and minutes';
}

