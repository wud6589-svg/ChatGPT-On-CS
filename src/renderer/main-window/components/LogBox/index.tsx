import React, { useEffect } from 'react';
import {
  Text,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  HStack,
  TableContainer,
  Button,
  Flex,
} from '@chakra-ui/react';
import { useWebSocketContext } from '../../hooks/useBroadcastContext';
import useGlobalStore from '../../../settings-window/stores/useGlobalStore';

const LogBox = () => {
  const { logs, clearLogs, addLog } = useGlobalStore();
  const { registerEventHandler } = useWebSocketContext();

  useEffect(() => {
    const unregister = registerEventHandler((message) => {
      if (message.event === 'log_show') {
        if (message.data) {
          const log = message.data as {
            time: string;
            content: string;
          };

          if (log) {
            addLog(log);
          }
        }
      }
    });

    return () => unregister();
  }, [registerEventHandler]); // eslint-disable-line

  const clearLog = () => {
    clearLogs();
  };

  const openSelectedFolder = () => {
    window.electron.ipcRenderer.sendMessage('open-logger-folder');
  };

  return (
    <Flex
      direction="column"
      h="100%"
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      overflow="hidden"
    >
      <Flex
        px={4}
        py={2}
        align="center"
        justify="space-between"
        gap={2}
        wrap="wrap"
        borderBottomWidth="1px"
        borderColor="gray.100"
        flexShrink={0}
      >
        <Text fontSize="sm" fontWeight="600" color="gray.800">
          运行日志
        </Text>
        <HStack spacing={2}>
          <Button size="xs" variant="ghost" onClick={clearLog}>
            清空
          </Button>
          <Button size="xs" variant="outline" onClick={openSelectedFolder}>
            打开日志文件
          </Button>
        </HStack>
      </Flex>
      {logs.length === 0 ? (
        <Flex
          flex="1"
          align="center"
          justify="center"
          px={6}
          color="gray.500"
          fontSize="sm"
          textAlign="center"
        >
          还没有运行日志。开启客服后，连接和回复记录会显示在这里。
        </Flex>
      ) : (
        <TableContainer flex="1" overflowY="auto">
          <Table size="sm">
            <Thead position="sticky" top={0} bg="white" zIndex={1}>
              <Tr>
                <Th w="148px">时间</Th>
                <Th>内容</Th>
              </Tr>
            </Thead>
            <Tbody>
              {logs.map((log, index) => (
                <Tr key={index}>
                  <Td whiteSpace="nowrap" color="gray.500" fontSize="xs">
                    {log.time}
                  </Td>
                  <Td whiteSpace="normal" fontSize="sm">
                    {log.content}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      )}
    </Flex>
  );
};

export default React.memo(LogBox);
