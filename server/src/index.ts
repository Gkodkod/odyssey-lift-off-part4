import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import cors from '@fastify/cors';
import { ApolloServer } from '@apollo/server';
import { fastifyApolloDrainPlugin, fastifyApolloHandler } from '@as-integrations/fastify';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';
import { TrackAPI } from './datasources/track-api';

async function startServer() {
  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: 'http://localhost:3000',
  });
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // Apollo Server
  const apollo = new ApolloServer({
    schema,
    plugins: [fastifyApolloDrainPlugin(app)],
  });
  await apollo.start();

  // Helper to run GraphQL ops
  const run = async (query: string, variables = {}): Promise<any> => {
    const context = {
      dataSources: { trackAPI: new TrackAPI({ cache: apollo.cache }) },
    };
    const res = await apollo.executeOperation({ query, variables }, { contextValue: context });
    if (res.body.kind === 'single') return res.body.singleResult;
    return null;
  };


  // OpenAPI / Swagger spec auto-generation
  await app.register(fastifySwagger, {
    openapi: {
      info: { title: 'Catstronauts API', version: '1.0.0' },
      servers: [{ url: 'http://localhost:4000' }],
    },
  });

  // Swagger UI at /docs
  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  // GraphQL endpoint
  app.route({
    url: '/graphql',
    method: ['GET', 'POST', 'OPTIONS'],
    handler: fastifyApolloHandler(apollo, {
      context: async () => ({
        dataSources: { trackAPI: new TrackAPI({ cache: apollo.cache }) },
      }),
    }),
  });

  // REST endpoints — Fastify auto-builds the OpenAPI spec from these schemas
  app.get('/tracks', {
    schema: {
      summary: 'Get all tracks',
      tags: ['Tracks'],
      response: { 
        200: { type: 'array', items: { type: 'object' } },
        404: { type: 'object' },
        500: { type: 'object' }
      },
    },
    handler: async (req, reply) => {
      const result = await run(`
        query { tracksForHome { 
          id title thumbnail length modulesCount numberOfViews description
          author { id name photo } modules { id title }
        }}
      `);
      if (result?.errors) return reply.status(500).send(result.errors);
      return result?.data?.tracksForHome;
    },
  });

  app.get('/track/:id', {
    schema: {
      summary: 'Get track by ID',
      tags: ['Tracks'],
    params: { type: 'object', properties: { id: { type: 'string' } } },
    response: { 
        200: { type: 'object' },
        404: { type: 'object' },
        500: { type: 'object' }
      },
  },
  handler: async (req, reply) => {

      const { id } = req.params as { id: string };
      const result = await run(
        `
        query ($id: ID!) { track(id: $id) { 
          id title thumbnail length modulesCount numberOfViews description
          author { id name photo } modules { id title length videoUrl content }
        }}
      `,
        { id }
      );
      if (result?.errors) return reply.status(500).send(result.errors);
      const data: any = result?.data?.track;
      if (!data) return reply.status(404).send({ message: `Track with ID ${id} not found` });
      return data;
    },
  });

  app.get('/module/:id', {
    schema: {
      summary: 'Get module by ID',
      tags: ['Modules'],
    params: { type: 'object', properties: { id: { type: 'string' } } },
    response: { 
        200: { type: 'object' },
        404: { type: 'object' },
        500: { type: 'object' }
      },
  },
  handler: async (req, reply) => {

      const { id } = req.params as { id: string };
      const result = await run(
        `
        query ($id: ID!) { module(id: $id) { 
          id title length content videoUrl 
        }}
      `,
        { id }
      );
      if (result?.errors) return reply.status(500).send(result.errors);
      const data: any = result?.data?.module;
      if (!data) return reply.status(404).send({ message: `Module with ID ${id} not found` });
      return data;
    },
  });

  app.post('/track/:id/views', {
    schema: {
      summary: 'Increment track views',
      tags: ['Tracks'],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      response: { 
        200: { type: 'object' },
        500: { type: 'object' }
      },
    },
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await run(
        `
        mutation ($id: ID!) { incrementTrackViews(id: $id) { 
          code success message track { id numberOfViews }
        }}
      `,
        { id }
      );
      if (result?.errors) return reply.status(500).send(result.errors);
      const data = result?.data?.incrementTrackViews;
      if (data?.code !== 200) return reply.status(data?.code || 500).send(data);
      return data;
    },
  });

  app.patch('/track/:id/numberOfViews', {
    schema: {
      summary: 'Increment track views (Tutorial PATCH)',
      tags: ['Tracks'],
      params: { type: 'object', properties: { id: { type: 'string' } } },
      response: { 
        200: { type: 'object' },
        500: { type: 'object' }
      },
    },
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await run(
        `
        mutation ($id: ID!) { incrementTrackViews(id: $id) { 
          code success message track { id numberOfViews }
        }}
      `,
        { id }
      );
      if (result?.errors) return reply.status(500).send(result.errors);
      const data = result?.data?.incrementTrackViews;
      if (data?.code !== 200) return reply.status(data?.code || 500).send(data);
      return data;
    },
  });



  await app.listen({ port: 4000 });
  console.log(`🚀 GraphQL  → http://localhost:4000/graphql`);
  console.log(`📖 Swagger  → http://localhost:4000/docs`);
}

startServer();
