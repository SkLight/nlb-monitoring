<?php
namespace nlb\daemon;

use PHPDaemon\Core\AppInstance;
use PHPDaemon\Servers\WebSocket\Pool;

class WebSocket extends AppInstance
{
    public $enableRPC = true;

    const ZERO_INTERVAL   = 0;
    const UPDATE_INTERVAL = 1e6; // 1 sec

    /** @var WebSocketRoute[] $sessions */
    private static $sessions = [];

    /**
     * @inheritdoc
     */
    public function onReady()
    {
        $appInstance = $this;

        /** @var Pool $pool */
        $pool = Pool::getInstance();

        $pool->addRoute('getData',
            function($client) use($appInstance)
            {
                $id = uniqid();
                self::$sessions[$id] = new WebSocketRoute($id, $client, $appInstance);

                return self::$sessions[$id];
            }
        );

        DataManager::startLoop();
    }

    /**
     * Send data to all clients if $clientId is null. If $clientId is not null send personal message.
     *
     * @param array       $message
     * @param string|null $clientId
     */
    public static function send($message, $clientId = null)
    {
        $message = json_encode($message);

        if($clientId === null)
        {
            foreach(self::$sessions as $session)
            {
                $session->client->sendFrame($message, 'STRING');
            }
        }
        else
        {
            self::$sessions[$clientId]->client->sendFrame($message, 'STRING');
        }
    }

    /**
     * Call this to close client connection
     *
     * @param string $id
     */
    public function closeSession($id)
    {
        unset(self::$sessions[$id]);
    }
}
