if("WebSocket" in window)
{
	var SOCKET_POINT = 'ws://nlb:8047/getData';

	// Frontend state
	var FRONTEND_STATE_WORK = 0;
	var FRONTEND_STATE_DOWN = 1;
	var FRONTEND_STATE_FAIL = 2;

	var COLOR_BY_FRONTEND_STATE = [];

	COLOR_BY_FRONTEND_STATE[FRONTEND_STATE_WORK] = 'green';
	COLOR_BY_FRONTEND_STATE[FRONTEND_STATE_DOWN] = 'brown';
	COLOR_BY_FRONTEND_STATE[FRONTEND_STATE_FAIL] = 'red';

	var timer, ws;

	function createSocket()
	{
		ws = new WebSocket(SOCKET_POINT);

		ws.onopen = function()
		{
			timer = window.setInterval(function()
			{
				var message = 'ping at ' + new Date();
				ws.send(message);
			}, 60000);
		};

		ws.onclose = function()
		{
			addNotifications({'Connection': ['Server is die!']});

			window.clearTimeout(timer);
			window.setTimeout(function() {createSocket()}, 1000);
		};

		ws.onmessage = function(data)
		{
			/**
			 * @type {{log:Object, dataMini:Object, dataMiniDiff:Object}} object
			 */
			var object = JSON.parse(data.data);

			if(object.log)
			{
				showLog(object.log);
			}

			if(object.dataMini)
			{
				showDataMini(object.dataMini);
			}
			else if(object.dataMiniDiff)
			{
				showDataMiniDiff(object.dataMiniDiff);
			}
			else
			{
				console.log('WTF???');
				console.log(data);
			}
		};
	}

	function blink(elementId, duration, times)
	{
		var counter = 0;
		var element = $(document.getElementById(elementId));

		var interval = setInterval(function()
		{
			if(counter++ === (times * 2))
			{
				clearInterval(interval);
				element.addClass("blue");
			}

			element.toggleClass("blue");
		}, duration);
	}

	function indexOf(array, index)
	{
		var section, result;

		for(section in array)
		{
			if(!array.hasOwnProperty(section))
				continue;

			result = array[section].indexOf(index);

			if(result !== -1)
				return result;
		}

		return -1;
	}

	function getCurrentNotifications()
	{
		var i, notifications = [];

		var notificationsNode = document.getElementById('notifications');
		var notificationsChildren = notificationsNode.getElementsByTagName('div');

		for(i = 0; i < notificationsChildren.length; i++)
		{
			notifications[notificationsChildren[i].getElementsByClassName('message')[0].textContent] = notificationsChildren[i];
		}

		return notifications;
	}

	function addNotifications(list)
	{
		var section, error, div, span;

		var notificationsNode = document.getElementById('notifications');
		var existsList = getCurrentNotifications();

		for(section in list)
		{
			if(!list.hasOwnProperty(section))
				continue;

			for(error in list[section])
			{
				if(!list[section].hasOwnProperty(error))
					continue;

				if(!existsList.hasOwnProperty(list[section][error]))
				{
					div = document.createElement('div');
					div.className = 'alert alert-danger';

					span = document.createElement('span');
					span.className = 'section';
					span.innerHTML = section + ': ';

					div.appendChild(span);

					span = document.createElement('span');
					span.className = 'message';
					span.innerHTML = list[section][error];

					div.appendChild(span);

					notificationsNode.appendChild(div);
				}
			}
		}
	}

	function removeNotifications(list)
	{
		var section;

		var notificationsNode = document.getElementById('notifications');
		var existsList = getCurrentNotifications();

		for(section in existsList)
		{
			if(!existsList.hasOwnProperty(section))
				continue;

			if(indexOf(list, section) === -1)
				notificationsNode.removeChild(existsList[section]);
		}
	}

	/**
	 * @typedef {Object} Info
	 * @property {int} receiveTime
	 */
	/**
	 * @typedef {Object} Errors
	 * @property {Array} config
	 * @property {Array} frontend
	 */
	/**
	 * @type {{info: Info[], errors: Errors}} log
	 */
	function showLog(log)
	{
		if(log.info)
		{
			var logNode, frontend, div, time;

			logNode = document.getElementById('nginx-mini-log');

			while(logNode.firstChild)
				logNode.removeChild(logNode.firstChild);

			for(frontend in log.info)
			{
				if(!log.info.hasOwnProperty(frontend))
					continue;

				time = (new Date(log.info[frontend].receiveTime * 1000)).toLocaleTimeString();

				div = document.createElement('div');
				div.className = 'receive-time';
				div.innerHTML = frontend + ' - ' + time;

				logNode.appendChild(div);
			}
		}

		if(log.errors)
		{
			addNotifications(log.errors);
			removeNotifications(log.errors);
		}
		else
		{
			removeNotifications([]);
		}
	}

	function showDataMini(dataMini)
	{
		var upstream, backend, frontend, ul, li, span, wrapper, state, stateClass;

		ul = document.getElementById('nginx-mini').getElementsByClassName('multicolumn')[0];

		while(ul.firstChild)
			ul.removeChild(ul.firstChild);

		for(upstream in dataMini)
		{
			if(!dataMini.hasOwnProperty(upstream))
				continue;

			li = document.createElement('li');
			li.id = upstream;
			li.className = 'upstream yellow';
			li.innerHTML = upstream;

			ul.appendChild(li);

			for(backend in dataMini[upstream])
			{
				if(!dataMini[upstream].hasOwnProperty(backend))
					continue;

				li = document.createElement('li');
				li.id = upstream + backend;
				li.className = 'backend';
				li.innerHTML = backend;

				ul.appendChild(li);

				wrapper = document.createElement('span');
				wrapper.className = 'frontend-wrapper';

				li.appendChild(wrapper);

				for(frontend in dataMini[upstream][backend])
				{
					if(!dataMini[upstream][backend].hasOwnProperty(frontend))
						continue;

					state = dataMini[upstream][backend][frontend];
					stateClass = COLOR_BY_FRONTEND_STATE[state];

					span = document.createElement('span');
					span.id = upstream + backend + frontend;
					span.className = 'frontend ' + stateClass;

					span.setAttribute('data-frontend-state', state);

					span.setAttribute('data-toggle', 'tooltip');
					span.setAttribute('data-placement', 'top');
					span.setAttribute('title', frontend);

					$(span).tooltip();
					wrapper.appendChild(span);
				}
			}
		}
	}

	function changeState(stateList)
	{
		if(!stateList)
			return;

		var upstream, frontend, backend, frontendId, backendId, span, state, stateClass;

		for(upstream in stateList)
		{
			if(!stateList.hasOwnProperty(upstream))
				continue;

			for(backend in stateList[upstream])
			{
				if(!stateList[upstream].hasOwnProperty(backend))
					continue;

				for(frontend in stateList[upstream][backend])
				{
					if(!stateList[upstream][backend].hasOwnProperty(frontend))
						continue;

					backendId  = upstream + backend;
					frontendId = upstream + backend + frontend;

					state = stateList[upstream][backend][frontend];
					stateClass = COLOR_BY_FRONTEND_STATE[state];

					span = document.getElementById(frontendId);
					span.className = 'frontend ' + stateClass;

					span.setAttribute('data-frontend-state', state);

					blink(backendId, 300, 3);
				}

				var backendFailCount = 0;
				var backendList = document.getElementById(backendId).getElementsByClassName('frontend-wrapper')[0].children;

				for(var i = 0; i < backendList.length; i++)
				{
					if(backendList[i].getAttribute('data-frontend-state') == FRONTEND_STATE_FAIL)
						backendFailCount++;
				}

				if(backendFailCount === backendList.length)
					$(document.getElementById(backendId)).addClass('red');
				else
					$(document.getElementById(backendId)).removeClass('red');
			}
		}
	}

	/**
	 * @param {{upstream:Object, backend:Object, frontend:Object}} remove
	 */
	function remove(remove)
	{
		if(!remove)
			return;

		var upstream, backend, frontend, upstreamId, backendId, frontendId, element;

		if(remove.frontend)
		{
			for(upstream in remove.frontend)
			{
				if(!remove.frontend.hasOwnProperty(upstream))
					continue;

				for(backend in remove.frontend[upstream])
				{
					if(!remove.frontend[upstream].hasOwnProperty(backend))
						continue;

					for(frontend in remove.frontend[upstream][backend])
					{
						if(!remove.frontend[upstream][backend].hasOwnProperty(frontend))
							continue;

						frontendId = upstream + backend + remove.frontend[upstream][backend][frontend];
						element = $(document.getElementById(frontendId));

						element.fadeOut('slow', function() {this.remove()});
					}
				}
			}
		}

		if(remove.backend)
		{
			for(upstream in remove.backend)
			{
				if(!remove.backend.hasOwnProperty(upstream))
					continue;

				for(backend in remove.backend[upstream])
				{
					if(!remove.backend[upstream].hasOwnProperty(backend))
						continue;

					backendId = upstream + remove.backend[upstream][backend];
					element = $(document.getElementById(backendId));

					element.fadeOut('slow', function() {this.remove()});
				}
			}
		}

		if(remove.upstream)
		{
			for(upstream in remove.upstream)
			{
				if(!remove.upstream.hasOwnProperty(upstream))
					continue;

				upstreamId = remove.upstream[upstream];
				element = $('#nginx-mini').find('li[id^=' + upstreamId + ']');
				element.fadeOut('slow', function() {this.remove()});
			}
		}
	}

	/**
	 * @param {{upstream:Object, backend:Object, frontend:Object}} insert
	 */
	function insert(insert)
	{
		if(!insert)
			return;

		var upstream, backend, frontend, upstreamId, backendId, state, stateClass, ul, li, span, element, wrapper;

		ul = document.getElementById('nginx-mini').getElementsByClassName('multicolumn')[0];

		if(insert.upstream)
		{
			for(upstream in insert.upstream)
			{
				if(!insert.upstream.hasOwnProperty(upstream))
					continue;

				upstreamId = insert.upstream[upstream];

				li = document.createElement('li');
				li.id = upstreamId;
				li.className = 'upstream yellow';
				li.innerHTML = upstreamId;
				li.style.display = 'none';

				ul.appendChild(li);

				$(li).fadeIn('slow');
			}
		}

		if(insert.backend)
		{
			for(upstream in insert.backend)
			{
				if(!insert.backend.hasOwnProperty(upstream))
					continue;

				for(backend in insert.backend[upstream])
				{
					if(!insert.backend[upstream].hasOwnProperty(backend))
						continue;

					li = document.createElement('li');
					li.id = upstream + insert.backend[upstream][backend];
					li.className = 'backend';
					li.innerHTML = insert.backend[upstream][backend];
					li.style.display = 'none';

					element = $('#nginx-mini').find('li[id^=' + upstream + ']').last();

					$(li).insertAfter(element).fadeIn('slow');
				}
			}
		}

		if(insert.frontend)
		{
			for(upstream in insert.frontend)
			{
				if(!insert.frontend.hasOwnProperty(upstream))
					continue;

				for(backend in insert.frontend[upstream])
				{
					if(!insert.frontend[upstream].hasOwnProperty(backend))
						continue;

					for(frontend in insert.frontend[upstream][backend])
					{
						if(!insert.frontend[upstream][backend].hasOwnProperty(frontend))
							continue;

						state = insert.frontend[upstream][backend][frontend];
						stateClass = COLOR_BY_FRONTEND_STATE[state];

						span = document.createElement('span');
						span.id = upstream + backend + frontend;
						span.className = 'frontend ' + stateClass;
						span.style.display = 'none';

						span.setAttribute('data-frontend-state', state);

						span.setAttribute('data-toggle', 'tooltip');
						span.setAttribute('data-placement', 'top');
						span.setAttribute('title', frontend);

						backendId = upstream + backend;

						backendId = document.getElementById(backendId);

						if(backendId.children.length > 0)
						{
							backendId.getElementsByClassName('frontend-wrapper')[0].appendChild(span);
						}
						else
						{
							wrapper = document.createElement('span');
							wrapper.className = 'frontend-wrapper';

							backendId.appendChild(wrapper);
							wrapper.appendChild(span);
						}

						$(span).tooltip().fadeIn('slow');
					}
				}
			}
		}
	}

	/**
	 * @param {{state:Object, remove:Object, insert:Object}} dataMiniDiff
	 */
	function showDataMiniDiff(dataMiniDiff)
	{
		remove(dataMiniDiff.remove);
		insert(dataMiniDiff.insert);

		changeState(dataMiniDiff.state);
	}

	createSocket();
}
else
{
	alert("Your browser doesn't support WebSocket");
}