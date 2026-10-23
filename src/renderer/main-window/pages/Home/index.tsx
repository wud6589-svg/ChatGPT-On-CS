import React, { useEffect } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import PageContainer from '../../../common/components/PageContainer';
import { trackPageView } from '../../../common/services/analytics';
import AppManager from '../../components/AppManager/index';
import Panels from '../../components/Panels';
import LogBox from '../../components/LogBox';

const HomePage = () => {
  const currentVersion = window.electron.ipcRenderer.get('get-version');
  useEffect(() => {
    trackPageView(`Home-${currentVersion}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageContainer
      flex="1"
      minH={0}
      h="auto"
      display="flex"
      flexDirection="column"
      p={0}
      insertProps={{
        flex: '1',
        minH: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Flex direction="column" flex="1" minH={0} gap={3} p={{ base: 3, md: 4 }}>
        <Box flex="1.15" minH="220px">
          <AppManager />
        </Box>
        <Panels />
        <Box flex="1" minH="150px">
          <LogBox />
        </Box>
      </Flex>
    </PageContainer>
  );
};

export default HomePage;
