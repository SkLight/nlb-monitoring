<?php
namespace nlb\daemon;

use PHPDaemon\Core\AppInstance;
use PHPDaemon\Servers\WebSocket\Connection;
use PHPDaemon\WebSocket\Route;

/** Session instance */
class WebSocketRoute extends Route
{
    /** @var WebSocket $appInstance */
    public $appInstance;

    /** @var Connection $client */
    public $client;

    /** @var string $id Session Id */
    private $id;

    /**
     * @param string           $id
     * @param Connection       $client
     * @param null|AppInstance $appInstance
     */
    public function __construct($id, $client, $appInstance)
    {
        parent::__construct($client, $appInstance);

        $this->id = $id;
    }

    /**
     * @inheritdoc
     */
    public function onHandshake()
    {
        $dataMini = DataManager::getDataMini();
        $log      = DataManager::getLog();

        $message = ['log' => $log, 'dataMini' => $dataMini];

        $this->appInstance->send($message, $this->id);
    }

    /**
     * @inheritdoc
     */
    public function onFrame($data, $type)
    {
//        $this->client->sendFrame('Server receive from client #' . $this->id . ' message "' . $data . '"', 'STRING');
    }

    /** @inheritdoc */
    public function onFinish()
    {
        parent::onFinish();
        $this->appInstance->closeSession($this->id);
    }
}
