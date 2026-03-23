import { Modal, Tabs, Text, Code, List, Title, Box, ThemeIcon, Group } from '@mantine/core';
import { IconShieldCheck, IconApple, IconBrandWindows, IconBrandDebian, IconWorld } from '@tabler/icons-react';

interface NetworkVerifyModalProps {
  opened: boolean;
  onClose: () => void;
}

const EXPECTED_DOMAINS = [
  { domain: 'api.openai.com', purpose: 'OpenAI API (GPT models)' },
  { domain: 'api.anthropic.com', purpose: 'Anthropic API (Claude models)' },
  { domain: 'generativelanguage.googleapis.com', purpose: 'Google AI API (Gemini models)' },
  { domain: 'brandon-fryslie.github.io', purpose: 'Models configuration (CDN)' },
];

export function NetworkVerifyModal({ opened, onClose }: NetworkVerifyModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap={8}>
          <ThemeIcon variant="light" color="teal" size="sm">
            <IconShieldCheck size={14} />
          </ThemeIcon>
          <Text fw={600} size="lg">Verify It Yourself</Text>
        </Group>
      }
      size="lg"
      overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
    >
      <Text size="sm" c="dimmed" mb="md">
        This app only connects to AI provider APIs and a static models configuration file.
        No analytics, no tracking, no third-party scripts. You can verify this yourself using
        network monitoring tools on your platform.
      </Text>

      <Title order={5} mb="xs">Expected Connections</Title>
      <Box mb="lg" p="sm" style={{ borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
        <List spacing="xs" size="sm" icon={<IconWorld size={14} style={{ color: '#909296' }} />}>
          {EXPECTED_DOMAINS.map(({ domain, purpose }) => (
            <List.Item key={domain}>
              <Code>{domain}</Code>{' '}
              <Text span size="xs" c="dimmed">{purpose}</Text>
            </List.Item>
          ))}
        </List>
        <Text size="xs" c="dimmed" mt="xs">
          If you see connections to any domain not listed above, something is wrong.
        </Text>
      </Box>

      <Title order={5} mb="xs">Platform Instructions</Title>
      <Tabs defaultValue="macos">
        <Tabs.List>
          <Tabs.Tab value="macos" leftSection={<IconApple size={14} />}>macOS</Tabs.Tab>
          <Tabs.Tab value="windows" leftSection={<IconBrandWindows size={14} />}>Windows</Tabs.Tab>
          <Tabs.Tab value="linux" leftSection={<IconBrandDebian size={14} />}>Linux</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="macos" pt="md">
          <Title order={6} mb={4}>Little Snitch (recommended)</Title>
          <Text size="sm" c="dimmed" mb="sm">
            Little Snitch shows every outgoing connection with a prompt. Install it and open this app
            — you will see connection requests only to the domains listed above. Deny any unexpected domain.
          </Text>

          <Title order={6} mb={4}>LuLu (free, open source)</Title>
          <Text size="sm" c="dimmed" mb="sm">
            LuLu is a free macOS firewall that alerts on outgoing connections. Install from{' '}
            <Code>objective-see.org/products/lulu.html</Code>, then open this app and observe the alerts.
          </Text>

          <Title order={6} mb={4}>nettop (built-in)</Title>
          <Text size="sm" c="dimmed" mb="xs">
            No install needed. Open Terminal and run:
          </Text>
          <Code block>nettop -p $(pgrep -f "your-browser")</Code>
          <Text size="sm" c="dimmed" mt="xs">
            Watch the "bytes in" and "bytes out" columns. All traffic should resolve to the expected domains.
          </Text>
        </Tabs.Panel>

        <Tabs.Panel value="windows" pt="md">
          <Title order={6} mb={4}>GlassWire</Title>
          <Text size="sm" c="dimmed" mb="sm">
            GlassWire provides a visual network monitor. Install it, then use this app and check
            the GlassWire graph. Filter by your browser process — all connections should be to the
            expected domains.
          </Text>

          <Title order={6} mb={4}>Wireshark</Title>
          <Text size="sm" c="dimmed" mb="xs">
            Capture and filter traffic with:
          </Text>
          <Code block>dns.qry.name contains "openai" or dns.qry.name contains "anthropic" or dns.qry.name contains "googleapis" or dns.qry.name contains "github.io"</Code>
          <Text size="sm" c="dimmed" mt="xs">
            Inspect DNS queries while using the app. You should only see queries for the expected domains.
            Any unexpected DNS queries indicate a problem.
          </Text>
        </Tabs.Panel>

        <Tabs.Panel value="linux" pt="md">
          <Title order={6} mb={4}>tcpdump</Title>
          <Text size="sm" c="dimmed" mb="xs">
            Capture DNS queries in real time:
          </Text>
          <Code block>sudo tcpdump -i any port 53 -l | grep -E "openai|anthropic|googleapis|github.io"</Code>
          <Text size="sm" c="dimmed" mt="xs" mb="sm">
            Run this in one terminal while using the app in your browser. All DNS lookups should match the expected domains.
          </Text>

          <Title order={6} mb={4}>Wireshark</Title>
          <Text size="sm" c="dimmed" mb="xs">
            Use the same DNS filter as the Windows instructions above. Wireshark on Linux works identically.
          </Text>

          <Title order={6} mb={4}>ss (built-in)</Title>
          <Text size="sm" c="dimmed" mb="xs">
            List active connections from your browser:
          </Text>
          <Code block>ss -tnp | grep browser_process_name</Code>
          <Text size="sm" c="dimmed" mt="xs">
            Resolve the destination IPs and verify they belong to the expected domains.
          </Text>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
