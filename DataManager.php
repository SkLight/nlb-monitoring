<?php

namespace nlb\daemon;

use PHPDaemon\Core\Timer;

// Frontend => Upstream => Backend
// Upstream => Backend => Frontend

class DataManager
{
    // Nginx status name by index
    const INDEX_BACKEND_NAME       = 0;
    const INDEX_BACKEND_DOWN       = 1;
    const INDEX_BACKEND_FAIL       = 2;
    const INDEX_BACKEND_REQUESTS   = 3;
    const INDEX_HTTP_499           = 4;
    const INDEX_HTTP_500           = 5;
    const INDEX_HTTP_503           = 6;
    const INDEX_TCP_ERRORS         = 7;
    const INDEX_HTTP_READ_TIMEOUT  = 8;
    const INDEX_HTTP_WRITE_TIMEOUT = 9;
    const INDEX_FAIL_TIMEOUT       = 10;
    const INDEX_MAX_FAILS          = 11;
    const INDEX_LAST_FAIL          = 12;
    const INDEX_TOTAL_FAILS        = 13;

    // Frontend state
    const FRONTEND_STATE_WORK = 0;
    const FRONTEND_STATE_DOWN = 1;
    const FRONTEND_STATE_FAIL = 2;

    // Nginx statuses
    private static $frontendData = [];

    // Snapshot of data for internal use. Mini.
    private static $dataMini     = [];

    // Log :)
    private static $log = [];

    // Upstream name list
    private static $sortUpstream = [];

    // For debug
    private static $testRemove = [];
    private static $testState  = [];

    /**
     * Template for Timer::add()
     *
     * @param string     $method   Method name for set timer
     * @param array      $params   Method arguments
     * @param float|int  $interval In milliseconds
     */
    private static function setTimer($method, $params = [], $interval = WebSocket::UPDATE_INTERVAL)
    {
        $callback = function(Timer $event) use($method, $params)
        {
            call_user_func_array([__CLASS__, $method], $params);
            $event->finish();
        };

        Timer::add($callback, $interval);
    }

    /**
     * Read config and init get data tasks
     *
     * @return array
     */
    public static function startLoop()
    {
        $errors = [];

        $config = @parse_ini_file('config.ini', true);

        if($config === false)
            $errors[] = 'Incorrect config file';

        if(isset($config['frontend']))
        {
            $frontendList = $config['frontend'];
        }
        else
        {
            $frontendList = [];
            $errors[] = 'Section [frontend] miss or empty';
        }

        self::$sortUpstream = isset($config['sort']) ? $config['sort']['upstream'] : [];

        self::$testRemove = isset($config['remove']) ? $config['remove'] : [];
        self::$testState  = isset($config['state'])  ? $config['state']  : [];

        // Get and unset removed frontend list
        $configDiff = array_values(array_diff(array_keys(self::$frontendData), array_keys($frontendList)));

        foreach($configDiff as $name)
        {
            unset(self::$log['info'][$name]);
            unset(self::$frontendData[$name]);
        }

        // Init get frontend statuses
        foreach($frontendList as $name => $host)
        {
            if(!is_string($name) || empty($name))
            {
                $errors[] = "Bad frontend name {$name}";
                continue;
            }

            if(!is_string($host) || empty($host))
            {
                $errors[] = "Bad frontend address {$name}";
                continue;
            }

            self::setTimer('getFrontendData', ['name' => $name, 'host' => $host], WebSocket::ZERO_INTERVAL);
        }

        if(count($errors) !== 0)
            self::$log['errors']['config'] = $errors;
        else
            unset(self::$log['errors']['config']);

        self::setTimer('updateDataMini');

        // Loop
        self::setTimer(__FUNCTION__);
    }

    /** @noinspection PhpUnusedPrivateMethodInspection
     *
     * Get status of frontend
     *
     * @callback
     * @param $name
     * @param $host
     */
    private static function getFrontendData($name, $host)
    {
        $url = "http://{$host}/status?json";

        $ch = curl_init();

        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 1, // 1 sec
        ]);

        $result      = curl_exec($ch);
        $httpStatus  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $errorNumber = curl_errno($ch);
        $errorString = curl_strerror($errorNumber);

        curl_close($ch);

        if($httpStatus === 200)
        {
            $data = json_decode($result, true);

            if(is_array($data))
            {
                self::$frontendData[$name] = $data;
                self::$log['info'][$name]['receiveTime'] = time();

                unset(self::$log['errors'][$name]);

                if(empty(self::$log['errors']))
                    unset(self::$log['errors']);
            }
            else
            {
                self::$log['errors'][$name] = ['Json not valid'];
            }
        }
        else
        {
            self::$log['errors'][$name] = [$errorString];
        }
    }

    /** @noinspection PhpUnusedPrivateMethodInspection
     *
     * Update data and create diff. Mini version.
     */
    private static function updateDataMini()
    {
        $dataMini     = [];
        $dataMiniDiff = [];

        $frontendData = self::$frontendData;
        $dataMiniOld  = self::$dataMini;

        // Prepare data for internal use
        foreach($frontendData as $frontendName => $frontendValue)
        {
            foreach($frontendValue as $upstreamName => $upstreamValue)
            {
                if(!is_array($upstreamValue))
                    continue;

                foreach($upstreamValue as $backend)
                {
                    if(!is_array($backend))
                        continue;

                    $backendName = $backend[self::INDEX_BACKEND_NAME];

                    $state = self::FRONTEND_STATE_WORK;

                    if($backend[self::INDEX_BACKEND_FAIL] == true)
                        $state = self::FRONTEND_STATE_FAIL;
                    else if($backend[self::INDEX_BACKEND_DOWN] == true)
                        $state = self::FRONTEND_STATE_DOWN;

                    // Debug start
                    if(isset(self::$testRemove['upstream']) && (self::$testRemove['upstream'] === $upstreamName))
                        continue;

                    if(isset(self::$testRemove['backend']) && (self::$testRemove['backend'] === $backendName))
                        continue;

                    if(isset(self::$testRemove['frontend']) && (self::$testRemove['frontend'] === $frontendName))
                        continue;

                    if(isset(self::$testState['blink']) && (self::$testState['blink'] === 'blink') && (rand(1, 1000) < 2))
                        $state = rand(0, 2);
                    // Debug end

                    $dataMini[$upstreamName][$backendName][$frontendName] = $state;
                }
            }
        }

        $dataMiniSorted = [];

        // Sort data by config
        foreach(self::$sortUpstream as $upstreamName)
        {
            if(isset($dataMini[$upstreamName]))
            {
                $dataMiniSorted[$upstreamName] = $dataMini[$upstreamName];
                unset($dataMini[$upstreamName]);
            }
        }

        foreach($dataMini as $upstreamName => $upstreamValue)
            $dataMiniSorted[$upstreamName] = $dataMini[$upstreamName];

        $dataMini = $dataMiniSorted;

        self::$dataMini = $dataMini;

        // Build diff
        // new upstream, new backend, new frontend, change state
        foreach($dataMini as $upstreamName => $upstreamValue)
        {
            if(!isset($dataMiniOld[$upstreamName]))
                $dataMiniDiff['insert']['upstream'][] = $upstreamName;

            foreach($upstreamValue as $backendName => $backendValue)
            {
                if(!isset($dataMiniOld[$upstreamName][$backendName]))
                    $dataMiniDiff['insert']['backend'][$upstreamName][] = $backendName;

                foreach($backendValue as $frontendName => $frontendValue)
                {
                    if(!isset($dataMiniOld[$upstreamName][$backendName][$frontendName]))
                        $dataMiniDiff['insert']['frontend'][$upstreamName][$backendName][$frontendName] = $frontendValue;

                    else if($frontendValue !== $dataMiniOld[$upstreamName][$backendName][$frontendName])
                        $dataMiniDiff['state'][$upstreamName][$backendName][$frontendName] = $frontendValue;
                }
            }
        }

        // remove upstream, remove backend, remove frontend
        foreach($dataMiniOld as $upstreamName => $upstreamValue)
        {
            if(!isset($dataMini[$upstreamName]))
            {
                $dataMiniDiff['remove']['upstream'][] = $upstreamName;
                continue;
            }

            foreach($upstreamValue as $backendName => $backendValue)
            {
                if(!isset($dataMini[$upstreamName][$backendName]))
                {
                    $dataMiniDiff['remove']['backend'][$upstreamName][] = $backendName;
                    continue;
                }

                foreach($backendValue as $frontendName => $frontendValue)
                {
                    if(!isset($dataMini[$upstreamName][$backendName][$frontendName]))
                        $dataMiniDiff['remove']['frontend'][$upstreamName][$backendName][] = $frontendName;
                }
            }
        }

        $message = ['log' => self::getLog(), 'dataMiniDiff' => $dataMiniDiff];

        WebSocket::send($message);
    }

    /**
     * @return array
     */
    public static function getDataMini()
    {
        return self::$dataMini;
    }

    /**
     * @return array
     */
    public static function getLog()
    {
        return self::$log;
    }
}
