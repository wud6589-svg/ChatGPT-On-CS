import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Flex,
  HStack,
  Tooltip,
  IconButton,
  Text,
  Checkbox,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { FiPause, FiPlay } from 'react-icons/fi';
import { useToast } from '../../hooks/useToast';
import {
  getConfig,
  updateConfig,
} from '../../../common/services/platform/controller';
import { DriverConfig } from '../../../common/services/platform/platform';
import { useWebSocketContext } from '../../hooks/useBroadcastContext';

type OptionProps = {
  isChecked: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  label: string;
  tip: string;
};

const Option = ({ isChecked, onChange, label, tip }: OptionProps) => (
  <WrapItem>
    <Checkbox isChecked={isChecked} onChange={onChange} colorScheme="teal">
      <Tooltip label={tip} hasArrow openDelay={300}>
        <Text as="span" fontSize="sm">
          {label}
        </Text>
      </Tooltip>
    </Checkbox>
  </WrapItem>
);

const Panels = () => {
  const { toast } = useToast();
  const { registerEventHandler } = useWebSocketContext();
  const [driverSettings, setDriverSettings] = useState<DriverConfig>({
    hasPaused: true,
    hasKeywordMatch: false,
    hasUseGpt: false,
    hasMouseClose: true,
    hasEscClose: true,
    hasTransfer: true,
    hasReplace: true,
  });

  const { data } = useQuery(['config', 'driver'], async () => {
    try {
      const resp = await getConfig({
        type: 'driver',
      });
      return resp;
    } catch (error) {
      toast({
        title: '获取配置失败',
        description: error instanceof Error ? error.message : String(error),
        status: 'error',
      });

      return null;
    }
  });

  const pausedHandler = useCallback(
    (message: any) => {
      if (message.event === 'has_paused') {
        setDriverSettings((prevSettings) => ({
          ...prevSettings,
          hasPaused: true,
        }));

        toast({
          title: '自动回复已暂停',
          status: 'info',
          position: 'top',
          duration: 5000,
          isClosable: true,
        });
      }
    },
    [toast],
  );

  useEffect(() => {
    const unregister = registerEventHandler(pausedHandler);

    return () => unregister();
  }, [registerEventHandler, pausedHandler]);

  useEffect(() => {
    if (data) {
      const obj = data.data as DriverConfig;
      setDriverSettings(obj);
    }
  }, [data]);

  const handleUpdateConfig = async (newConfig: Partial<DriverConfig>) => {
    const updatedConfig = { ...driverSettings, ...newConfig };
    setDriverSettings(updatedConfig);
    try {
      await updateConfig({
        type: 'driver',
        cfg: updatedConfig,
      });

      if ('hasPaused' in newConfig) {
        toast({
          title: '更新配置成功',
          description: newConfig.hasPaused
            ? '已经暂停自动回复功能'
            : '已经开启自动回复功能',
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
      }
    } catch (error) {
      const errormsg =
        error instanceof Error ? error.message : JSON.stringify(error);
      toast({
        title: '更新配置失败',
        description: errormsg,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const paused = driverSettings.hasPaused;

  return (
    <Box
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      px={{ base: 3, md: 4 }}
      py={3}
      flexShrink={0}
    >
      <Flex
        align={{ base: 'stretch', md: 'center' }}
        direction={{ base: 'column', md: 'row' }}
        gap={4}
      >
        <HStack spacing={3} minW="200px">
          <IconButton
            icon={paused ? <FiPlay /> : <FiPause />}
            aria-label={paused ? '开启自动回复' : '暂停自动回复'}
            size="md"
            onClick={() => handleUpdateConfig({ hasPaused: !paused })}
            isRound
            colorScheme={paused ? 'green' : 'red'}
          />
          <Box>
            <Text fontSize="sm" fontWeight="600" color="gray.800">
              {paused ? '自动回复已暂停' : '自动回复进行中'}
            </Text>
            <Text fontSize="xs" color="gray.500">
              {paused ? '点击按钮开始回复' : '点击按钮暂停回复'}
            </Text>
          </Box>
        </HStack>
        <Wrap spacingX={4} spacingY={2} flex="1">
          <Option
            isChecked={driverSettings.hasKeywordMatch}
            onChange={(e) =>
              handleUpdateConfig({ hasKeywordMatch: e.target.checked })
            }
            label="关键词匹配"
            tip="将优先匹配关键词，未匹配的才去调用 GPT 接口"
          />
          <Option
            isChecked={driverSettings.hasUseGpt}
            onChange={(e) =>
              handleUpdateConfig({ hasUseGpt: e.target.checked })
            }
            label="GPT 回复"
            tip="是否开启 GPT 回复，关闭后只会使用关键词回复"
          />
          <Option
            isChecked={driverSettings.hasTransfer}
            onChange={(e) =>
              handleUpdateConfig({ hasTransfer: e.target.checked })
            }
            label="关键词转人工"
            tip="如果匹配到设定的关键词，将自动转人工"
          />
          <Option
            isChecked={driverSettings.hasReplace}
            onChange={(e) =>
              handleUpdateConfig({ hasReplace: e.target.checked })
            }
            label="关键词替换"
            tip="如果匹配到设定的关键词，将自动替换成自定义的关键词"
          />
          <Option
            isChecked={driverSettings.hasEscClose}
            onChange={(e) =>
              handleUpdateConfig({ hasEscClose: e.target.checked })
            }
            label="按 ESC 键自动暂停"
            tip="当按下 ESC 键时自动暂停"
          />
        </Wrap>
      </Flex>
    </Box>
  );
};

export default React.memo(Panels);
